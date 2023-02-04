// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { simpleNS } from './simple_tree_view';
import { ClickNS } from './clicked_tree_view';

// This method is called when your extension is deactivated
export function deactivate() { }

export function activate(context: vscode.ExtensionContext) {
	console.log('ihz00 "tree-view" is now active!');

	let tree = new ClickNS.TreeDataProvider();

	vscode.window.registerTreeDataProvider('myTreeView', tree);
}

