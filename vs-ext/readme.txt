ihz00 activate
ihz01 call createGit
ihz createGit Using git from: git

ihz02 create then
1. create provider
  ihz04a extension call GitTreeCompareProvider to create a provider
  ihz11a GitTreeCompareProvider constructor
         readConfig
  ihz11b GitTreeCompareProvider init

2. ihz04b extension call window.createTreeView to create a treeView

3. ihz04c extension call init for provider and treeView
  ihz11b GitTreeCompareProvider init (called by extension.ts provider.init(treeView)
  ihz11b-2 call changeRepository
   
  3.1 ihz15 changeRepository  // /home/user/tests
     ihz13 setRepository      // /home/user/tests
     ihz1h getChildren
     ihz1a updateTreeRootFolder
     ihz1i updateRefs
     ihz1c getStoredBaseRef
     ihz1d isRefExisting
     ihz1f updateStoredBaseRef
     ihz1j updateDiff
    ihz15-9 end of  changRepository

ihz1h getChildren
ihz1g getTreeItem
ihz1ab toTreeItem
