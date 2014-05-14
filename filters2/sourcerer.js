// Generic js compiler

/*

 - `style` parameter can be "bundle" or "amd"
  "bundle" is a all the dependencies in a single file, like browserify does
  see cjs in filters repo for example of something similar
  "amd" is like the existing amd-tree filter.  It wraps each file
 - `main` is the path to the js source file, it can be relative to this rule
   file (starting with ".") or relative to the repo root.  amd-tree has this logic.

 - `include-bootstrap` - for bundle, this is a flag for if it should include the
   bootstrap module system.
 - regenreator - if it should run the js files through regenerator
 - minify - if it should minify the js output


For tedit in browser, we only need "bundle" for now.  So porting the old "cjs"
filter to use the new APIs in git-tree is most the work.
*/
