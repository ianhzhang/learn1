// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';



// This method is called when your extension is deactivated
export function deactivate() { }

var myTreeProvider: TreeDataProvider;

export function activate(context: vscode.ExtensionContext) {
	console.log('ihz00 "tree-view" is now active!');
	myTreeProvider = new TreeDataProvider();


	context.subscriptions.push(
		// Method 1. work
		vscode.window.registerTreeDataProvider('BranchView', myTreeProvider),
		vscode.window.registerTreeDataProvider('FileView', myTreeProvider),
	);

	// method 2?  Does not show
	/*
	var myTreeView = vscode.window.createTreeView("ihz", {
		treeDataProvider: myTreeProvider
	});
	*/


}

class TreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
	onDidChangeTreeData?: vscode.Event<TreeItem | null | undefined> | undefined;

	data: TreeItem[];

	constructor() {
		this.data = [new TreeItem('cars', [
			new TreeItem(
				'Ford', [new TreeItem('Fiesta'), new TreeItem('Focus'), new TreeItem('Mustang')]),
			new TreeItem(
				'BMW', [new TreeItem('320'), new TreeItem('X3'), new TreeItem('X5')])
		])];

		// other way to create
		let honda = new TreeItem('Honda', []);
		let civic = new TreeItem('Civic');
		let accord = new TreeItem('Accord');

		honda.addChild(civic);
		honda.addChild(accord);
		this.data[0].addChild(honda);

		vscode.commands.registerCommand('myTreeView.context_menu_run1', item => this.run_tree_item(item));
		vscode.commands.registerCommand('myTreeView.context_menu_run2', item => {
			console.log("ihz run2:", item)
		});
	}

	getTreeItem(element: TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
		return element;
	}

	getChildren(element?: TreeItem | undefined): vscode.ProviderResult<TreeItem[]> {
		if (element === undefined) {
			return this.data;
		}
		return element.children;
	}

	run_tree_item(item: TreeItem) {
		console.log("ihz click item", item);
		console.log("ihz root:", myTreeProvider);
	}
}

class TreeItem extends vscode.TreeItem {
	children: TreeItem[] | undefined;

	constructor(label: string, children?: TreeItem[]) {
		super(
			{ label: label },
			children === undefined ? vscode.TreeItemCollapsibleState.None :
				vscode.TreeItemCollapsibleState.Expanded);

		this.children = children;
		if (this.children === undefined || this.children.length == 0) {
			this.contextValue = "ihzChildless"
		} else {
			this.contextValue = "ihzParent"
		}


		// this.iconPath = vscode.ThemeIcon.File;	// work
		// this.iconPath = new vscode.ThemeIcon("accounts-view-bar-icon");	// work.  https://code.visualstudio.com/api/references/icons-in-labels#icon-listing
		// console.log("ihz resourceUri:", this.resourceUri)	// default is undefined

		// treat as a file
		// this.resourceUri = vscode.Uri.file("/Users/ianz/work.txt")
		// console.log("ihzxx", this.resourceUri);
		console.log("ihz TreeItem")
	}

	addChild(child: TreeItem) {
		this.children?.push(child);
		this.contextValue = "ihzParent"
	}
}