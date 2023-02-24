// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';



// This method is called when your extension is deactivated
export function deactivate() { }

var myTreeProvider: TreeDataProvider;
// var myTreeView: vscode.TreeView<TreeItem>;

export function activate(context: vscode.ExtensionContext) {
	console.log('ihz00 "tree-view" is now active!');

	// Method 1. work
	myTreeProvider= new TreeDataProvider();
	vscode.window.registerTreeDataProvider('myTreeView', myTreeProvider);

	// method 2?  Does not show
	/*
	myTreeView = vscode.window.createTreeView("myTreeView", {
		treeDataProvider: myTreeProvider
	});	
	*/
	
}

class TreeDataProvider implements vscode.TreeDataProvider<TreeItem> {

	private changeEvent = new vscode.EventEmitter<void>();
	public data: TreeItem[];

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
			console.log("ihz run2:", item);
		
			myTreeProvider.data.forEach( dataItem => {
				dataItem.clearIcon("debug-breakpoint-disabled");
			});
			
			item.setIcon("debug-breakpoint-disabled", "ihzSelectColorGreen");
			this.changeEvent.fire();
		});
	}

	public get onDidChangeTreeData(): vscode.Event<void> {
        return this.changeEvent.event;
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
		
		myTreeProvider.data.forEach( dataItem => {
			dataItem.clearIcon("debug-breakpoint-log");
		});
		
		item.setIcon("debug-breakpoint-log", "ihzSelectColorRed");
		this.changeEvent.fire();
		
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
		// console.log("ihz TreeItem:", this.iconPath); // undefined
	}

	addChild(child: TreeItem) {
		this.children?.push(child);
		this.contextValue = "ihzParent"
	}
	

	clearIcon(iconName: string) {
		if (this.iconPath!==undefined ) {
			let themeIcon = this.iconPath as vscode.ThemeIcon
			if (themeIcon !== undefined && themeIcon.id == iconName) {
				console.log("ihz cleanIcon:", this.label)
				this.iconPath = undefined;
			}
		}

		
		if (this.children === undefined) {
			return; 
		}

		this.children?.forEach( dataItem => {
			dataItem.clearIcon(iconName);
		});
	}
	

	setIcon(iconName: string, colorName: string) {
		this.iconPath = new vscode.ThemeIcon(iconName, new vscode.ThemeColor(colorName));
		console.log("ihz xx:", this.iconPath.id)
	}

}