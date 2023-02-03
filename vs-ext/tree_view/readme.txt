yo code
? What's the name of your extension? tree-view


cd tree-view
mkdir resources
cp ../vscode-git-tree-compare/resources/logo.* resources/

src/extension.ts:
====================================================================================================

	export function activate(context: vscode.ExtensionContext) {
		console.log('ihz00 "tree-view" is now active!');

		let disposable = vscode.commands.registerCommand('tree-view.helloWorld', () => {
			console.log("ihz01 tree start");
		});

		context.subscriptions.push(disposable);
	}

package.json:
====================================================================================================
already generated:
  	"contributes": {
		"commands": [
		{
			"command": "tree-view.helloWorld",
			"title": "Ian Tree View"
		}
		]
  	},

--------------------------------
	"contributes": {
		"viewsContainers": {
			"activitybar": [
				{
					"id": "tree-view.helloWorld",
					"icon": "./resources/logo.svg",
					"title": "Git Tree Compare"
				}
			]
		},
		"views": {
			"myTreeView": [
				{
					"id": "tree-view.helloWorld",
					"name": "none",
					"icon": "./resources/logo.svg"
				}
			]
		},

---------------------------------
question:
1. click icon only shows:
	ihz00 "tree-view" is now active!
2. run View -> Command Palette -> "Ian Tree View"
	ihz00 "tree-view" is now active!
	ihz99 tree disposable


The following will register a command in "Command Palette"
	let disposable = vscode.commands.registerCommand('tree-view.helloWorld', () => {
		console.log("ihz99 tree disposable");
	});

	context.subscriptions.push(disposable);

Without this:  Click icon will run activate, but we cannot run it from Command Palette.