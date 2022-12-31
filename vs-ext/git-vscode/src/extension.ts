import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "git-vscode" is now active!');
	let gitExt = vscode.extensions.getExtension('vscode.git')!.exports;
	let gitApi = gitExt.getAPI(1);
	console.log("ihz2 gitApi:", gitApi);
	let gitPath = gitApi.git.path;		// "git"
	console.log("ihz2 gitPath:", gitPath);	// "git"

	// if the root directory (vscode open directory) is not git directory (not .git file)
	// then, repos = []; repos.length==0
	
	let repos = gitApi.repositories;
	console.log("ihz3 repos:", repos);

	if (repos.length > 0) {
		console.log("ihz4:",repos[0]);
		console.log("ihz5:", repos[0].rootUri.path);
	}
	















	let disposable = vscode.commands.registerCommand('git-vscode.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from git-vscode!');
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
