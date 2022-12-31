import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "git-vscode" is now active!');
	let gitExt = vscode.extensions.getExtension('vscode.git');
	let gitApi = gitExt?.exports;
	console.log("ihz1 gitApi:", gitApi);


	let disposable = vscode.commands.registerCommand('git-vscode.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from git-vscode!');
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
