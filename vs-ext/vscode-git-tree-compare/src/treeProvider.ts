import * as assert from 'assert'
import * as path from 'path'

import { TreeDataProvider, TreeItem, TreeItemCollapsibleState,
         Uri, Disposable, EventEmitter, TextDocumentShowOptions,
         QuickPickItem, ProgressLocation, Memento, OutputChannel,
         workspace, commands, window, WorkspaceFoldersChangeEvent, TreeView, ThemeIcon } from 'vscode'
import { NAMESPACE } from './constants'
import { Repository, Git } from './git/git'
import { Ref, RefType } from './git/api/git'
import { anyEvent, filterEvent, eventToPromise } from './git/util'
import { getDefaultBranch, getHeadModificationDate, getBranchCommit,
         diffIndex, IDiffStatus, StatusCode, getAbsGitDir, getAbsGitCommonDir,
         getWorkspaceFolders, getGitRepositoryFolders } from './gitHelper'
import { debounce, throttle } from './git/decorators'
import { normalizePath } from './fsUtils';
import { API as GitAPI, Repository as GitAPIRepository } from './typings/git';

class FileElement implements IDiffStatus {
    constructor(
        public srcAbsPath: string,
        public dstAbsPath: string,
        public dstRelPath: string,
        public status: StatusCode,
        public isSubmodule: boolean) {}
    
    get label(): string {
        return path.basename(this.dstAbsPath)
    }
}

class FolderElement {
    constructor(
        public label: string,
        public dstAbsPath: string,
        public useFilesOutsideTreeRoot: boolean) {}
}

class RepoRootElement extends FolderElement {
    constructor(absPath: string) {
        super('/', absPath, true);
    }
}

class RefElement {
    constructor(public repositoryRoot: string, public refName: string, public hasChildren: boolean) {}
}

export type Element = FileElement | FolderElement | RepoRootElement | RefElement
type FileSystemElement = FileElement | FolderElement

class ChangeBaseRefItem implements QuickPickItem {
	protected get shortCommit(): string { return (this.ref.commit || '').substr(0, 8); }
	get label(): string { return this.ref.name!; }
	get description(): string { return this.shortCommit; }

	constructor(public ref: Ref) { }
}

class ChangeBaseTagItem extends ChangeBaseRefItem {
	override get description(): string {
		return "Tag at " + this.shortCommit;
	}
}

class ChangeBaseRemoteHeadItem extends ChangeBaseRefItem {
	override get description(): string {
		return "Remote branch at " + this.shortCommit;
	}
}

class ChangeBaseCommitItem implements QuickPickItem {
	get label(): string { return "$(git-commit) Custom commit"; }
	get description(): string { return ""; }
}

class ChangeRepositoryItem implements QuickPickItem {
    constructor(public repositoryRoot: string) { }

	get label(): string { return path.basename(this.repositoryRoot); }
	get description(): string { return this.repositoryRoot; }
}

type FolderAbsPath = string;

export class GitTreeCompareProvider implements TreeDataProvider<Element>, Disposable {

    // Events
    private _onDidChangeTreeData = new EventEmitter<Element | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    // Configuration options
    private treeRootIsRepo: boolean;
    private includeFilesOutsideWorkspaceFolderRoot: boolean;
    private openChangesOnSelect: boolean;
    private autoChangeRepository: boolean;
    private autoRefresh: boolean;
    private refreshIndex: boolean;
    private iconsMinimal: boolean;
    private fullDiff: boolean;
    private findRenames: boolean;
    private showCollapsed: boolean;
    private compactFolders: boolean;

    // Dynamic options
    private repository: Repository | undefined;
    private baseRef: string;
    private viewAsList = false;
   
    // Static state of repository
    private workspaceFolder: string;
    private absGitDir: string;
    private absGitCommonDir: string;
    private repoRoot: FolderAbsPath;

    // Dynamic state of repository
    private headLastChecked: Date;
    private headName: string | undefined; // undefined if detached
    private headCommit: string;

    // Diff parameters, derived
    private mergeBase: string;

    // Diff results
    private filesInsideTreeRoot: Map<FolderAbsPath, IDiffStatus[]>;
    private filesOutsideTreeRoot: Map<FolderAbsPath, IDiffStatus[]>;
    
    // UI parameters, derived
    private treeRoot: FolderAbsPath;

    // UI state
    private treeView: TreeView<Element>;
    private isPaused: boolean;

    // Other
    private readonly disposables: Disposable[] = [];

    constructor(private readonly git: Git, 
                private readonly gitApi: GitAPI, 
                private readonly outputChannel: OutputChannel, 
                private readonly globalState: Memento,
                private readonly asAbsolutePath: (relPath: string) => string) {
        console.log("ihz11a GitTreeCompareProvider  constructor");
        this.readConfig();
    }

    async init(treeView: TreeView<Element>) {
        console.log("ihz11b GitTreeCompareProvider init");

        this.treeView = treeView

        // use arbitrary repository at start if there are multiple (prefer selected ones)
        const gitRepos = getGitRepositoryFolders(this.gitApi, true);
        // console.log("ihz11b-1", gitRepos);   // root of repo  /home/user/tests

        if (gitRepos.length > 0) {
            console.log('ihz11b-2 call changeRepository');    // hit
            await this.changeRepository(gitRepos[0]);   // ihz15, ihz13, ihz1h, ihz1a, ihz1i, ihz1c, ihz1d, ihz1f, ihz1j
        }
        // console.log('ihz11b-3 continue');

        this.disposables.push(workspace.onDidChangeConfiguration(this.handleConfigChange, this));
        this.disposables.push(workspace.onDidChangeWorkspaceFolders(this.handleWorkspaceFoldersChanged, this));
        this.disposables.push(this.gitApi.onDidOpenRepository(this.handleRepositoryOpened, this));
        for (const repository of this.gitApi.repositories) {    
            // console.log("ihz11b-4", repository); // repository is standardlib  interface
            // console.log('ihz11b-5')
            this.disposables.push(repository.ui.onDidChange(() => this.handleRepositoryUiChange(repository)));
        }

        const isRelevantChange = (uri: Uri) => {
            if (uri.scheme != 'file') {
                return false;
            }
            // non-git change
            if (!/\/\.git\//.test(uri.path) && !/\/\.git$/.test(uri.path)) {
                return true;
            }
            // git ref change
            if (/\/\.git\/refs\//.test(uri.path) && !/\/\.git\/refs\/remotes\/.+\/actions/.test(uri.path)) {
                return true;
            }
            // git index change
            if (/\/\.git\/index$/.test(uri.path)) {
                return true;
            }
            this.log(`Ignoring irrelevant change: ${uri.fsPath}`);
            return false;
        }
        // console.log("ihz11b-6");
        const fsWatcher = workspace.createFileSystemWatcher('**');
        this.disposables.push(fsWatcher);
        const onWorkspaceChange = anyEvent(fsWatcher.onDidChange, fsWatcher.onDidCreate, fsWatcher.onDidDelete);
        const onRelevantWorkspaceChange = filterEvent(onWorkspaceChange, isRelevantChange);
        this.disposables.push(onRelevantWorkspaceChange(this.handleWorkspaceChange, this));
        console.log("ihz11b-7 end of GitTreeCompareProvider init");
        /*
            ihz1h getChildren
            ihz1g getTreeItem
            ihz1ab  toTreeItem
        */
    }

    async setRepository(repositoryRoot: string) {
        console.log("ihz13 setRepository", repositoryRoot);   // /home/user/tests

        const dotGit = await this.git.getRepositoryDotGit(repositoryRoot);      // our own function in git.ts
        const repository = this.git.open(repositoryRoot, dotGit);   // own function, repositoryRoot: /home/user/tests, dotGit: /home/user/tests/.git
        const absGitDir = await getAbsGitDir(repository);   // absGitDir: /home/user/tests/.git

        const absGitCommonDir = await getAbsGitCommonDir(repository);   // /home/user/tests/.git
        const repoRoot = normalizePath(repository.root);        // /home/user/tests
        const workspaceFolders = getWorkspaceFolders(repoRoot);     // WorkspaceFolder is a standard interface, it has attribute: uri, name, index

        if (workspaceFolders.length == 0) {
            throw new Error(`Could not find any workspace folder for ${repositoryRoot}`);
        }

        this.repository = repository;
        this.absGitCommonDir = absGitCommonDir;     // /home/user/tests/.git
        this.absGitDir = absGitDir;                 // /home/user/tests/.git
        this.repoRoot = repoRoot;                   // /home/user/tests

        // Sort descending by folder depth
        workspaceFolders.sort((a, b) => {
            const aDepth = a.uri.fsPath.split(path.sep).length;
            const bDepth = b.uri.fsPath.split(path.sep).length;
            return bDepth - aDepth;
        });
        // If repo appears in multiple workspace folders, pick the deepest one.
        // TODO let the user choose which one
        this.workspaceFolder = normalizePath(workspaceFolders[0].uri.fsPath);   // /home/user/tests, normmalizePath is in fsUtils.ts
        this.updateTreeRootFolder();
        this.log('Using repository: ' + this.repoRoot); // /home/user/tests


        const repoName = path.basename(repoRoot);
        console.log("ihz13-2 repoName:", repoName)

        this.treeView.title = repoName;     // tests.   It is on top of the view: GIT TREE COMPARE: TESTS
    }

    async unsetRepository() {
        console.log("ihz14 unsetRepository");

        this.repository = undefined;
        this._onDidChangeTreeData.fire();
        this.log('No repository selected');

        this.treeView.title = 'none';
    }

    async changeRepository(repositoryRoot: string) {
        console.log("ihz15 changeRepository", repositoryRoot);  // /home/user/tests

        try {
            await this.setRepository(repositoryRoot);   // /home/user/tests
            await this.updateRefs();
            await this.updateDiff(false);
        } catch (e: any) {
            let msg = 'Changing the repository failed';
            this.log(msg, e);
            window.showErrorMessage(`${msg}: ${e.message}`);
            return;
        }
        this._onDidChangeTreeData.fire();
        console.log("ihz15-9 end of changeRepository")
    }

    async promptChangeRepository() {
        console.log("ihz16 promptChangeRepository");

        const gitRepos = getGitRepositoryFolders(this.gitApi);
        const gitReposWithoutCurrent = gitRepos.filter(w => this.repoRoot !== w);
        const picks = gitReposWithoutCurrent.map(r => new ChangeRepositoryItem(r));
        const placeHolder = 'Select a repository';
        const choice = await window.showQuickPick<ChangeRepositoryItem>(picks, { placeHolder });

        if (!choice) {
            return;
        }

        await this.changeRepository(choice.repositoryRoot);
    }

    private async handleRepositoryOpened(repository: GitAPIRepository) {
        console.log("ihz17 handleRepositoryOpened");

        if (this.repository === undefined) {
            await this.changeRepository(repository.rootUri.fsPath);
        }
        this.disposables.push(repository.ui.onDidChange(() => this.handleRepositoryUiChange(repository)));
    }

    private async handleRepositoryUiChange(repository: GitAPIRepository) {
        console.log("ihz18 handleRepositoryUiChange");

        if (!this.autoChangeRepository || !repository.ui.selected) {
            return;
        }
        let repoRoot = repository.rootUri.fsPath;
        if (!getGitRepositoryFolders(this.gitApi).includes(repoRoot)) {
            return;
        }
        repoRoot = normalizePath(repoRoot);
        if (repoRoot === this.workspaceFolder) {
            return;
        }
        this.log(`SCM repository change detected - changing repository: ${repoRoot}`);
        await this.changeRepository(repoRoot);
    }

    private async handleWorkspaceFoldersChanged(e: WorkspaceFoldersChangeEvent) {
        console.log("ihz19 handleWorkspaceFoldersChanged");

        // If the folder got removed that was currently active in the diff,
        // then pick an arbitrary new one.
        for (var removedFolder of e.removed) {
            if (normalizePath(removedFolder.uri.fsPath) === this.workspaceFolder) {
                const gitRepos = getGitRepositoryFolders(this.gitApi, true);
                if (gitRepos.length > 0) {
                    const newFolder = gitRepos[0];
                    await this.changeRepository(newFolder);
                } else {
                    await this.unsetRepository();
                }
            }
        }
        // If no repository is selected but new folders were added,
        // then pick an arbitrary new one.
        if (!this.repository && e.added) {
            const gitRepos = getGitRepositoryFolders(this.gitApi, true);
            if (gitRepos.length > 0) {
                const newFolder = gitRepos[0];
                await this.changeRepository(newFolder);
            }
        }
    }

    private log(msg: string, error: Error | undefined=undefined) {
        if (error) {
            console.warn(msg, error);
            msg = `${msg}: ${error.message}`;
        }
        this.outputChannel.appendLine(msg);
    }

    private updateTreeRootFolder() {
        console.log("ihz1a updateTreeRootFolder");

        const repoIsWorkspaceSubfolder = this.repoRoot.startsWith(this.workspaceFolder + path.sep);
        if (this.treeRootIsRepo || repoIsWorkspaceSubfolder) {
            this.treeRoot = this.repoRoot;
        } else {
            this.treeRoot = this.workspaceFolder;
        }
    }

    private readConfig() {
        console.log("ihz1b readConfig");

        const config = workspace.getConfiguration(NAMESPACE);
        this.treeRootIsRepo = config.get<string>('root') === 'repository';
        this.includeFilesOutsideWorkspaceFolderRoot = config.get<boolean>('includeFilesOutsideWorkspaceRoot', true);
        this.openChangesOnSelect = config.get<boolean>('openChanges', true);
        this.autoChangeRepository = config.get<boolean>('autoChangeRepository', false);
        this.autoRefresh = config.get<boolean>('autoRefresh', true);
        this.refreshIndex = config.get<boolean>('refreshIndex', true);
        this.iconsMinimal = config.get<boolean>('iconsMinimal', false);
        this.fullDiff = config.get<string>('diffMode') === 'full';
        this.findRenames = config.get<boolean>('findRenames', true);
        this.showCollapsed = config.get<boolean>('collapsed', false);
        this.compactFolders = config.get<boolean>('compactFolders', false);
        // console.log("ihz config:", config) // config is an interface
        // console.log("ihz includeFilesOutsideWorkspaceFolderRoot:", this.includeFilesOutsideWorkspaceFolderRoot) // is defined in package.json, true
        // console.log("ihz openChangesOnSelect", this.openChangesOnSelect)    // true
        // console.log("ihz autoChangeRepository:", this.autoChangeRepository)     // false
        // console.log("ihz autoRefresh:", this.autoRefresh)   // true
        // console.log("ihz refreshIndex ", this.refreshIndex)     // true
        // console.log("ihz fullDiff", this.fullDiff)  // false
        // console.log("ihz findRenames", this.findRenames)    // true
        // console.log("ihz showCollapsed", this.showCollapsed) // false
        // console.log("ihz compactFolders", this.compactFolders)  // true
    }

    private async getStoredBaseRef(): Promise<string | undefined> {
        console.log("ihz1c getStoredBaseRef");

        let baseRef = this.globalState.get<string>('baseRef_' + this.repoRoot);
        if (baseRef) {
            if (await this.isRefExisting(baseRef) || await this.isCommitExisting(baseRef)) {
                this.log('Using stored base ref: ' + baseRef);
            } else {
                this.log('Not using non-existant stored base ref: ' + baseRef);
                baseRef = undefined;
            }
        }
        return baseRef;
    }

    private async isRefExisting(refName: string): Promise<boolean> {
        console.log("ihz1d isRefExisting");

        const refs = await this.repository!.getRefs();
        const exists = refs.some(ref => ref.name === refName);
        return exists;
    }

    private async isCommitExisting(id: string): Promise<boolean> {
        console.log("ihz1e isCommitExisting");

        try {
            await this.repository!.getCommit(id);
            return true;
        } catch {
            return false;
        }
    }

    private updateStoredBaseRef(baseRef: string) {
        console.log("ihz1f updateStoredBaseRef");

        this.globalState.update('baseRef_' + this.repoRoot, baseRef);
    }

    getTreeItem(element: Element): TreeItem {   // one of the important interface function we need to implement
        console.log("ihz1g getTreeItem");

        return toTreeItem(element, this.openChangesOnSelect, this.iconsMinimal, this.showCollapsed, this.viewAsList, this.asAbsolutePath);
    }

    async getChildren(element?: Element): Promise<Element[]> {  // one of the important interface function we need to implement
        console.log("ihz1h getChildren");

        if (!element) {
            if (!this.repository) {
                return [];
            }
            if (!this.filesInsideTreeRoot) {
                try {
                    await this.updateDiff(false);
                } catch (e: any) {
                    // some error occured, ignore and try again next time
                    this.log('Ignoring updateDiff() error during initial getChildren()', e);
                    return [];
                }
            }
            const hasFiles =
                this.filesInsideTreeRoot.size > 0 ||
                (this.includeFilesOutsideWorkspaceFolderRoot && this.filesOutsideTreeRoot.size > 0);

                return [new RefElement(this.repoRoot, this.baseRef, hasFiles)];
        } else if (element instanceof RefElement) {
            const entries: Element[] = [];
            if (this.includeFilesOutsideWorkspaceFolderRoot && this.filesOutsideTreeRoot.size > 0) {
                entries.push(new RepoRootElement(this.repoRoot));
            }
            return entries.concat(this.getFileSystemEntries(this.treeRoot, false));
        } else if (element instanceof FolderElement) {
            return this.getFileSystemEntries(element.dstAbsPath, element.useFilesOutsideTreeRoot);
        }
        assert(false, "unsupported element type");
        return [];
    }

    private async updateRefs(baseRef?: string): Promise<void>
    {
        console.log("ihz1i updateRefs");

        this.log('Updating refs');
        try {
            const headLastChecked = new Date();
            const HEAD = await this.repository!.getHEAD();
            // if detached HEAD, then .commit exists, otherwise only .name
            const headName = HEAD.name;
            const headCommit = HEAD.commit || await getBranchCommit(this.absGitCommonDir, HEAD.name!);
            if (baseRef) {
                const exists = await this.isRefExisting(baseRef) || await this.isCommitExisting(baseRef);
                if (!exists) {
                    // happens when branch was deleted
                    baseRef = undefined;
                }
            }
            if (!baseRef) {
                baseRef = await this.getStoredBaseRef();           
            }
            if (!baseRef) {
                baseRef = await getDefaultBranch(this.repository!, HEAD);
            }
            if (!baseRef) {
                if (HEAD.name) {
                    baseRef = HEAD.name;
                } else {
                    // detached HEAD and no default branch was found
                    // pick an arbitrary ref as base, give preference to common refs
                    const refs = await this.repository!.getRefs();
                    const commonRefs = ['origin/main', 'main', 'origin/master', 'master'];
                    const match = refs.find(ref => ref.name !== undefined && commonRefs.indexOf(ref.name) !== -1);
                    if (match) {
                        baseRef = match.name;
                    } else if (refs.length > 0) {
                        baseRef = refs[0].name;
                    }
                }
            }
            if (!baseRef) {
                // this should never happen
                throw new Error('Base ref could not be determined!');
            }
            const HEADref: string = (HEAD.name || HEAD.commit)!;
            let mergeBase = baseRef;
            if (!this.fullDiff && baseRef != HEAD.name) {
                // determine merge base to create more sensible/compact diff
                try {
                    mergeBase = await this.repository!.getMergeBase(HEADref, baseRef);
                } catch (e) {
                    // sometimes the merge base cannot be determined
                    // this can be the case with shallow clones but may have other reasons
                }
            }
            if (this.headName !== headName) {
                this.log(`HEAD ref updated: ${this.headName} -> ${headName}`);
            }
            if (this.headCommit !== headCommit) {
                this.log(`HEAD ref commit updated: ${this.headCommit} -> ${headCommit}`);
            }
            if (this.baseRef !== baseRef) {
                this.log(`Base ref updated: ${this.baseRef} -> ${baseRef}`);
            }
            if (!this.fullDiff && this.mergeBase !== mergeBase) {
                this.log(`Merge base updated: ${this.mergeBase} -> ${mergeBase}`);
            }
            this.headLastChecked = headLastChecked;
            this.headName = headName;
            this.headCommit = headCommit;
            this.baseRef = baseRef;
            this.mergeBase = mergeBase;
            this.updateStoredBaseRef(baseRef);
        } catch (e) {
            throw e;
        }
    }

    @throttle
    private async updateDiff(fireChangeEvents: boolean) {
        console.log("ihz1j updateDiff");

        if (!this.baseRef) {
            await this.updateRefs();
        }

        const filesInsideTreeRoot = new Map<FolderAbsPath, IDiffStatus[]>();
        const filesOutsideTreeRoot = new Map<FolderAbsPath, IDiffStatus[]>();

        const diff = await diffIndex(this.repository!, this.mergeBase, this.refreshIndex, this.findRenames);
        const untrackedCount = diff.reduce((prev, cur, _) => prev + (cur.status === 'U' ? 1 : 0), 0);
        this.log(`${diff.length} diff entries (${untrackedCount} untracked)`);

        for (const entry of diff) {
            const folder = path.dirname(entry.dstAbsPath);

            const isInsideTreeRoot = folder === this.treeRoot || folder.startsWith(this.treeRoot + path.sep);
            const files = isInsideTreeRoot ? filesInsideTreeRoot : filesOutsideTreeRoot;
            const rootFolder = isInsideTreeRoot ? this.treeRoot : this.repoRoot;

            if (files.size == 0) {
                files.set(rootFolder, new Array());
            }

            // add this and all parent folders to the folder map
            let currentFolder = folder
            while (currentFolder != rootFolder) {
                if (!files.has(currentFolder)) {
                    files.set(currentFolder, new Array());
                }
                currentFolder = path.dirname(currentFolder)
            }

            const entries = files.get(folder)!;
            entries.push(entry);
        }

        let treeHasChanged = false;
        if (fireChangeEvents) {
            const hasChanged = (folderPath: string, insideTreeRoot: boolean) => {
                const oldFiles = insideTreeRoot ? this.filesInsideTreeRoot : this.filesOutsideTreeRoot;
                const newFiles = insideTreeRoot ? filesInsideTreeRoot : filesOutsideTreeRoot;
                const oldItems = oldFiles.get(folderPath)!.map(f => `${f.status}|${f.dstAbsPath}`);
                const newItems = newFiles.get(folderPath)!.map(f => `${f.status}|${f.dstAbsPath}`);
                for (const {files, items} of [{files: oldFiles, items: oldItems},
                                              {files: newFiles, items: newItems}]) {
                    // add direct subdirectories to items list
                    for (const folder of files.keys()) {
                        if (path.dirname(folder) === folderPath) {
                            items.push(folder);
                        }
                    }
                }
                return !sortedArraysEqual(oldItems, newItems);
            }

            const treeRootChanged = !this.filesInsideTreeRoot || !filesInsideTreeRoot.size !== !this.filesInsideTreeRoot.size;
            const mustAddOrRemoveRepoRootElement = !this.filesOutsideTreeRoot || !filesOutsideTreeRoot.size !== !this.filesOutsideTreeRoot.size;
            if (treeRootChanged || mustAddOrRemoveRepoRootElement) {
                treeHasChanged = true;
            } else {
                for (const folder of filesInsideTreeRoot.keys()) {
                    if (!this.filesInsideTreeRoot.has(folder) ||
                            hasChanged(folder, true)) {
                        treeHasChanged = true;
                        break;
                    }
                }
                if (!treeHasChanged) {
                    for (const folder of filesOutsideTreeRoot.keys()) {
                        if (!this.filesOutsideTreeRoot.has(folder) ||
                                hasChanged(folder, false)) {
                            treeHasChanged = true;
                            break;
                        }
                    }
                }
            }
        }

        this.filesInsideTreeRoot = filesInsideTreeRoot;
        this.filesOutsideTreeRoot = filesOutsideTreeRoot;

        if (fireChangeEvents && treeHasChanged) {
            this.log('Refreshing tree')
            this._onDidChangeTreeData.fire();
        }
    }

    private async isHeadChanged() {
        console.log("ihz1k isHeadChanged");

        // Note that we can't rely on filesystem change notifications for .git/HEAD
        // because the workspace root may be a subfolder of the repo root
        // and change notifications are currently limited to workspace scope.
        // See https://github.com/Microsoft/vscode/issues/3025.
        const mtime = await getHeadModificationDate(this.absGitDir);
        if (mtime > this.headLastChecked) {
            return true;
        }
        // At this point we know that HEAD still points to the same symbolic ref or commit (if detached).
        // If HEAD is not detached, check if the symbolic ref resolves to a different commit.
        if (this.headName) {
            // this.repository.getBranch() is not used here to avoid git invocation overhead
            const headCommit = await getBranchCommit(this.absGitCommonDir, this.headName);
            if (this.headCommit !== headCommit) {
                return true;
            }
        }
        return false;
    }

    @debounce(2000)
    private async handleWorkspaceChange(uri: Uri) {
        console.log("ihz1l handleWorkspaceChange");

        if (!this.autoRefresh || !this.repository) {
            return
        }
        // ignore changes outside of repo root
        //  e.g. "c:\Users\..\AppData\Roaming\Code - Insiders\User\globalStorage"
        const normPath = normalizePath(uri.fsPath);
        if (!normPath.startsWith(this.repoRoot + path.sep)) {
            this.log(`Ignoring change outside of repository: ${uri.fsPath}`)
            return
        }
        if (!window.state.focused || !this.treeView.visible) {
            if (this.isPaused) {
                return;
            }
            this.isPaused = true;
            const onDidFocusWindow = filterEvent(window.onDidChangeWindowState, e => e.focused);
            const onDidBecomeVisible = filterEvent(this.treeView.onDidChangeVisibility, e => e.visible);
            const onDidFocusWindowOrBecomeVisible = anyEvent<any>(onDidFocusWindow, onDidBecomeVisible);
            await eventToPromise(onDidFocusWindowOrBecomeVisible);
            this.isPaused = false;
            this.handleWorkspaceChange(uri);
            return;
        }
        this.log(`Relevant workspace change detected: ${uri.fsPath}`)
        if (await this.isHeadChanged()) {
            // make sure merge base is updated when switching branches
            try {
                await this.updateRefs(this.baseRef);
            } catch (e: any) {
                // some error occured, ignore and try again next time
                this.log('Ignoring updateRefs() error during handleWorkspaceChange()', e);
                return;
            }
        }
        try {
            await this.updateDiff(true);
        } catch (e: any) {
            // some error occured, ignore and try again next time
            this.log('Ignoring updateDiff() error during handleWorkspaceChange()', e);
            return;
        }
    }

    private async handleConfigChange() {
        console.log("ihz1m handleConfigChange");

        const oldTreeRootIsRepo = this.treeRootIsRepo;
        const oldInclude = this.includeFilesOutsideWorkspaceFolderRoot;
        const oldOpenChangesOnSelect = this.openChangesOnSelect;
        const oldAutoRefresh = this.autoRefresh;
        const oldRefreshIndex = this.refreshIndex;
        const oldIconsMinimal = this.iconsMinimal;
        const oldFullDiff = this.fullDiff;
        const oldFindRenames = this.findRenames;
        const oldCompactFolders = this.compactFolders;
        this.readConfig();
        if (oldTreeRootIsRepo != this.treeRootIsRepo ||
            oldInclude != this.includeFilesOutsideWorkspaceFolderRoot ||
            oldOpenChangesOnSelect != this.openChangesOnSelect ||
            oldIconsMinimal != this.iconsMinimal ||
            (!oldAutoRefresh && this.autoRefresh) ||
            (!oldRefreshIndex && this.refreshIndex) ||
            oldFullDiff != this.fullDiff ||
            oldFindRenames != this.findRenames ||
            oldCompactFolders != this.compactFolders) {

            if (!this.repository) {
                return;
            }

            const oldTreeRoot = this.treeRoot;
            if (oldTreeRootIsRepo != this.treeRootIsRepo) {
                this.updateTreeRootFolder();
            }
            
            if (oldFullDiff != this.fullDiff || 
                oldFindRenames != this.findRenames ||
                oldTreeRoot != this.treeRoot ||
                (!oldAutoRefresh && this.autoRefresh) ||
                (!oldRefreshIndex && this.refreshIndex)) {
                await this.updateRefs(this.baseRef);
                await this.updateDiff(false);
            }
            this._onDidChangeTreeData.fire();
        }
    }

    private getFileSystemEntries(folder: string, useFilesOutsideTreeRoot: boolean): FileSystemElement[] {
        console.log("ihz1n getFileSystemEntries");

        const entries: FileSystemElement[] = [];
        const files = useFilesOutsideTreeRoot ? this.filesOutsideTreeRoot : this.filesInsideTreeRoot;
        const relPathBase = useFilesOutsideTreeRoot ? this.repoRoot : this.treeRoot;

        if (this.viewAsList) {
            // add files of direct and nested subfolders
            const folders: string[] = [];
            for (const folder2 of files.keys()) {
                if (folder2.startsWith(folder + path.sep)) {
                    folders.push(folder2);
                }
            }
            // TODO sorting should be folder-aware to match SCM view
            folders.sort((a, b) => a.localeCompare(b));
            for (const folder2 of folders) {
                const fileEntries = files.get(folder2)!;
                for (const file of fileEntries) {
                    const dstRelPath = path.relative(relPathBase, file.dstAbsPath);
                    entries.push(new FileElement(file.srcAbsPath, file.dstAbsPath, dstRelPath, file.status, file.isSubmodule));
                }
            }
        } else if (this.compactFolders) {
            // add direct subfolders and apply compaction
            for (const folder2 of files.keys()) {
                if (path.dirname(folder2) === folder) {
                    let compactedPath = folder2;
                    // not very efficient, needs a better data structure
                    outer: while (true) {
                        const hasFiles = files.get(compactedPath)!.length > 0;
                        if (hasFiles) {
                            break;
                        }
                        let subfolder: string | null = null;
                        for (const folder3 of files.keys()) {
                            if (path.dirname(folder3) === compactedPath) {
                                if (subfolder === null) {
                                    subfolder = folder3;
                                } else {
                                    subfolder = null;
                                    break outer;
                                }
                            }
                        }
                        if (subfolder === null) {
                            throw new Error('unexpected');
                        }
                        compactedPath = subfolder;
                    }

                    const label = path.relative(folder, compactedPath);
                    entries.push(new FolderElement(
                        label, compactedPath, useFilesOutsideTreeRoot));
                }
            }
            entries.sort((a, b) => a.label.split(path.sep, 1)[0].localeCompare(b.label.split(path.sep, 1)[0]));
        } else {
            // add direct subfolders
            for (const folder2 of files.keys()) {
                if (path.dirname(folder2) === folder) {
                    const label = path.basename(folder2);
                    entries.push(new FolderElement(
                        label, folder2, useFilesOutsideTreeRoot));
                }
            }
            entries.sort((a, b) => path.basename(a.dstAbsPath).localeCompare(path.basename(b.dstAbsPath)));
        }

        // add files of folder
        const fileEntries = files.get(folder);
        // there is no mapping entry if treeRoot!=repoRoot and
        // there are no files within treeRoot, therefore, this is guarded
        if (fileEntries) {
            for (const file of fileEntries) {
                const dstRelPath = path.relative(relPathBase, file.dstAbsPath);
                entries.push(new FileElement(file.srcAbsPath, file.dstAbsPath, dstRelPath, file.status, file.isSubmodule));
            }
        }

        return entries
    }

    private getDiffStatus(fileEntry?: FileElement): IDiffStatus | undefined {
        console.log("ihz1o getDiffStatus");

        if (fileEntry) {
            return fileEntry;
        }
        const uri = window.activeTextEditor && window.activeTextEditor.document.uri;
        if (!uri || uri.scheme !== 'file') {
            return;
        }
        const dstAbsPath = uri.fsPath;
        const folder = path.dirname(dstAbsPath);
        const isInsideTreeRoot = folder === this.treeRoot || folder.startsWith(this.treeRoot + path.sep);
        const files = isInsideTreeRoot ? this.filesInsideTreeRoot : this.filesOutsideTreeRoot;
        const diffStatus = files.get(folder)?.find(file => file.dstAbsPath === dstAbsPath);
        return diffStatus;
    }

    async openChanges(fileEntry?: FileElement) {
        console.log("ihz1p openChanges");

        const diffStatus = this.getDiffStatus(fileEntry);
        if (!diffStatus) {
            return;
        }
        await this.doOpenChanges(diffStatus.srcAbsPath, diffStatus.dstAbsPath, diffStatus.status);
    }

    async doOpenChanges(srcAbsPath: string, dstAbsPath: string, status: StatusCode, preview=true) {
        console.log("ihz1q doOpenChanges");

        const right = Uri.file(dstAbsPath);
        const left = this.gitApi.toGitUri(Uri.file(srcAbsPath), this.mergeBase);

        if (status === 'U' || status === 'A') {
            return commands.executeCommand('vscode.open', right);
        }
        if (status === 'D') {
            return commands.executeCommand('vscode.open', left);
        }

        const options: TextDocumentShowOptions = {
            preview: preview
        };
        const filename = path.basename(dstAbsPath);
        return await commands.executeCommand('vscode.diff',
            left, right, filename + " (Working Tree)", options);
    }

    openAllChanges(entry: RefElement | RepoRootElement | FolderElement | undefined) {
        console.log("ihz1r openAllChanges");

        const withinFolder = entry instanceof FolderElement ? entry.dstAbsPath : undefined;
        for (const file of this.iterFiles(withinFolder)) {
            this.doOpenChanges(file.srcAbsPath, file.dstAbsPath, file.status, false);
        }
    }

    async openFile(fileEntry?: FileElement) {
        console.log("ihz1s openFile");

        const diffStatus = this.getDiffStatus(fileEntry);
        if (!diffStatus) {
            return;
        }
        return this.doOpenFile(diffStatus.dstAbsPath, diffStatus.status);
    }

    async doOpenFile(dstAbsPath: string, status: StatusCode, preview=false) {
        console.log("ihz1t doOpenFile");

        const right = Uri.file(dstAbsPath);
        const left = this.gitApi.toGitUri(right, this.mergeBase);
        const uri = status === 'D' ? left : right;
        const options: TextDocumentShowOptions = {
            preview: preview
        };
        return commands.executeCommand('vscode.open', uri, options);
    }

    openChangedFiles(entry: RefElement | RepoRootElement | FolderElement | undefined) {
        console.log("ihz1u openChangedFiles");

        const withinFolder = entry instanceof FolderElement ? entry.dstAbsPath : undefined;
        for (const file of this.iterFiles(withinFolder)) {
            if (file.status == 'D') {
                continue;
            }
            this.doOpenFile(file.dstAbsPath, file.status, false);
        }
    }

    *iterFiles(withinFolder: string | undefined) {
        console.log("ihz1v iterFiles");

        for (let filesMap of [this.filesInsideTreeRoot, this.filesOutsideTreeRoot]) {
            for (let [folder, files] of filesMap.entries()) {
                if (withinFolder && !folder.startsWith(withinFolder)) {
                    continue;
                }
                for (let file of files) {
                    if (!file.isSubmodule) {
                        yield file;
                    }
                }
            }
        }
    }

    async promptChangeBase() {
        console.log("ihz1w promptChangeBase");

        if (!this.repository) {
            window.showErrorMessage('No repository selected');
            return;
        }
        const commit = new ChangeBaseCommitItem();
        const refs = (await this.repository.getRefs()).filter(ref => ref.name);
        const heads = refs.filter(ref => ref.type === RefType.Head).map(ref => new ChangeBaseRefItem(ref));
        const tags = refs.filter(ref => ref.type === RefType.Tag).map(ref => new ChangeBaseTagItem(ref));
        const remoteHeads = refs.filter(ref => ref.type === RefType.RemoteHead).map(ref => new ChangeBaseRemoteHeadItem(ref));
        const picks = [commit, ...heads, ...tags, ...remoteHeads];

        const placeHolder = 'Select a ref to use as comparison base';
        const choice = await window.showQuickPick<QuickPickItem>(picks, { placeHolder });

        if (!choice) {
            return;
        }

        let baseRef: string;

        if (choice instanceof ChangeBaseRefItem) {
            baseRef = choice.ref.name!;
        } else if (choice instanceof ChangeBaseCommitItem) {
            const commitInput = await window.showInputBox({
                prompt: 'Enter a commit hash to use as comparison base',
                placeHolder: 'Commit hash'
            })
            if (!commitInput) {
                return;
            }
            baseRef = commitInput;
        } else {
            throw new Error("unsupported item type");
        }
        
        if (this.baseRef === baseRef) {
            return;
        }
        window.withProgress({ location: ProgressLocation.Window, title: 'Updating Tree Base' }, async _ => {
            try {
                await this.updateRefs(baseRef);
            } catch (e: any) {
                let msg = 'Updating the git tree base failed';
                this.log(msg, e);
                window.showErrorMessage(`${msg}: ${e.message}`);
                return;
            }
            try {
                await this.updateDiff(false);
            } catch (e: any) {
                let msg = 'Updating the git tree failed';
                this.log(msg, e);
                window.showErrorMessage(`${msg}: ${e.message}`);
                // clear the tree as it would be confusing to display the old tree under the new base
                this.filesInsideTreeRoot = new Map();
                this.filesOutsideTreeRoot = new Map();
            }
            this.log('Refreshing tree');
            this._onDidChangeTreeData.fire();
        });
    }

    async manualRefresh() {
        console.log("ihz1x manualRefresh");

        window.withProgress({ location: ProgressLocation.Window, title: 'Updating Tree' }, async _ => {
            try {
                if (await this.isHeadChanged()) {
                    // make sure merge base is updated when switching branches
                    await this.updateRefs(this.baseRef);
                }
                await this.updateDiff(true);
            } catch (e: any) {
                let msg = 'Updating the git tree failed';
                this.log(msg, e);
                window.showErrorMessage(`${msg}: ${e.message}`);
            }
        });
    }

    async switchToMergeDiff() {
        console.log("ihz1y switchToMergeDiff");

        const config = workspace.getConfiguration(NAMESPACE);
        await config.update('diffMode', 'merge', true);
    }

    async switchToFullDiff() {
        console.log("ihz1z switchToFullDiff");

        const config = workspace.getConfiguration(NAMESPACE);
        await config.update('diffMode', 'full', true);
    }

    viewAsTree(v: boolean) {
        console.log("ihz1aa viewAsTree");

        const viewAsList = !v;
        if (viewAsList === this.viewAsList)
            return;
        this.viewAsList = viewAsList;
        commands.executeCommand('setContext', NAMESPACE + '.viewAsList', viewAsList);
        this.log('Refreshing tree');
        this._onDidChangeTreeData.fire();
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
    }
}

function toTreeItem(element: Element, openChangesOnSelect: boolean, iconsMinimal: boolean,
                    showCollapsed: boolean, viewAsList: boolean,
                    asAbsolutePath: (relPath: string) => string): TreeItem {
    console.log("ihz1ab toTreeItem");
    
    const gitIconRoot = asAbsolutePath('resources/git-icons');
    if (element instanceof FileElement) {
        const item = new TreeItem(element.label);
        const statusText = getStatusText(element);
        item.tooltip = `${element.dstAbsPath} • ${statusText}`;
        if (element.srcAbsPath !== element.dstAbsPath) {
            item.tooltip = `${element.srcAbsPath} → ${item.tooltip}`;
        }
        if (viewAsList) {
            item.description = path.dirname(element.dstRelPath);
            if (item.description === '.') {
                item.description = '';
            }
        }
        item.contextValue = element.isSubmodule ? 'submodule' : 'file';
        item.id = element.dstAbsPath;
        item.iconPath = path.join(gitIconRoot,	toIconName(element) + '.svg');
        if (!element.isSubmodule) {
            const command = openChangesOnSelect ? 'openChanges' : 'openFile';
            item.command = {
                command: NAMESPACE + '.' + command,
                arguments: [element],
                title: ''
            };
        }
        return item;
    } else if (element instanceof RepoRootElement) {
        const item = new TreeItem(element.label, TreeItemCollapsibleState.Collapsed);
        item.tooltip = element.dstAbsPath;
        item.contextValue = 'root';
        item.id = 'root'
        if (!iconsMinimal) {
            item.iconPath = new ThemeIcon('folder-opened');
        }
        return item;
    } else if (element instanceof FolderElement) {
        const item = new TreeItem(element.label, showCollapsed ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.Expanded);
        item.tooltip = element.dstAbsPath;
        item.contextValue = 'folder';
        item.id = element.dstAbsPath;
        if (!iconsMinimal) {
            item.iconPath = new ThemeIcon('folder-opened');
        }
        return item;
    } else if (element instanceof RefElement) {
        const label = element.refName;
        const state = element.hasChildren ? TreeItemCollapsibleState.Expanded : TreeItemCollapsibleState.None;
        const item = new TreeItem(label, state);
        item.tooltip = `${element.refName} (${path.basename(element.repositoryRoot)})`;
        item.contextValue = 'ref';
        item.id = 'ref'
        if (!iconsMinimal) {
            item.iconPath = new ThemeIcon('git-compare');
        }
        return item;
    }
    throw new Error('unsupported element type');
}

function toIconName(element: FileElement) {
    console.log("ihz1ac toIconName");

    switch(element.status) {
        case 'U': return 'status-untracked';
        case 'A': return 'status-added';
        case 'D': return 'status-deleted';
        case 'M': return 'status-modified';
        case 'C': return 'status-conflict';
        case 'T': return 'status-typechange';
        case 'R': return 'status-renamed';
    }
}

function getStatusText(element: FileElement) {
    console.log("ihz1ad getStatusText");

    switch(element.status) {
        case 'U': return 'Untracked';
        case 'A': return 'Added';
        case 'D': return 'Deleted';
        case 'M': return 'Modified';
        case 'C': return 'Conflict';
        case 'T': return 'Type changed';
        case 'R': return 'Renamed';
    }
}

function sortedArraysEqual<T> (a: T[], b: T[]): boolean {
    console.log("ihz1ae sortedArraysEqual");

    if (a.length != b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}
