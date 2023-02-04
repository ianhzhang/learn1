import * as vscode from 'vscode';

export namespace simpleNS {

    export class TreeDataProvider implements vscode.TreeDataProvider<MyTreeItem> {
        onDidChangeTreeData?: vscode.Event<MyTreeItem | null | undefined> | undefined;
    
        data: MyTreeItem[];
    
        constructor() {
            this.data = [new MyTreeItem('cars simple', [
                new MyTreeItem(
                    'Ford', [new MyTreeItem('Fiesta'), new MyTreeItem('Focus'), new MyTreeItem('Mustang')]),
                new MyTreeItem(
                    'BMW', [new MyTreeItem('320'), new MyTreeItem('X3'), new MyTreeItem('X5')])
            ])];
    
            // other way to create
            let honda = new MyTreeItem('Honda',[]);
            let civic = new MyTreeItem('Civic');
            let accord = new MyTreeItem('Accord');
    
            honda.addChild(civic);
            honda.addChild(accord);
            this.data[0].addChild(honda);
    
        }
    
        getTreeItem(element: MyTreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
            return element;
        }
    
        getChildren(element?: MyTreeItem | undefined): vscode.ProviderResult<MyTreeItem[]> {
            if (element === undefined) {
                return this.data;
            }
            return element.children;
        }
    }
    
    class MyTreeItem extends vscode.TreeItem {
        children: MyTreeItem[] | undefined;
    
        constructor(label: string, children?: MyTreeItem[]) {
            super(
                label,
                children === undefined ? vscode.TreeItemCollapsibleState.None :
                    vscode.TreeItemCollapsibleState.Expanded);
            this.children = children;
        }
    
        addChild(child:MyTreeItem) {
            this.children?.push(child);
        }
    }
}