sudo npm install -g yo generator-code
sudo npm install -g npm@9.2.0 


yo code

? What type of extension do you want to create? New Extension (TypeScript)
? What's the name of your extension? HelloWorld
? What's the identifier of your extension? helloworld
? What's the description of your extension? 
? Initialize a git repository? Yes
? Bundle the source code with webpack? No
? Which package manager to use? npm

ls
helloworld

cd helloworld
code .

Run helloworld:
1. F5
2. Run -> Start Debugging
3. New Editor: Ctrl+Shift P
   Search Hello World


Struct:
src/extension:
	let disposable = vscode.commands.registerCommand('helloworld.helloWorld', () => {
		console.log("ihz Hello World start");
		vscode.window.showInformationMessage('Hello World from HelloWorld!');
	});

package.json:
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "helloworld.helloWorld",
        "title": "Hello World"
      }
    ]
  },

helloworld.helloWorld is the id
Hell World is the title

When we search the extension (Ctrl + Shift + P), we search the title.


TypeScript vs Javascript:
typescript: extension.js is in the src/ directory.
javascript: extension.js is in the root directory.


sudo npm install -g --save-dev webpack
sudo npm install -g --save-dev webpack-cli
