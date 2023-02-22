// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';



// This method is called when your extension is deactivated
export function deactivate() { }

export function activate(context: vscode.ExtensionContext) {
	console.log('ihz00 "tree-view" is now active!');

	vscode.window.registerTreeDataProvider('myTreeView', new TreeDataProvider());
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
		let honda = new TreeItem('Honda',[]);
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
		console.log("ihz click item", item)
	}
}

class TreeItem extends vscode.TreeItem {
	children: TreeItem[] | undefined;

	constructor(label: string, children?: TreeItem[]) {
		super(
			label,
			children === undefined ? vscode.TreeItemCollapsibleState.None :
				vscode.TreeItemCollapsibleState.Expanded);
		this.children = children;
	}

	addChild(child:TreeItem) {
		this.children?.push(child);
	}
}