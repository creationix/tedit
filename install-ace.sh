#!/bin/sh -e
cd `dirname $0`
curl -L https://github.com/ajaxorg/ace-builds/archive/master.tar.gz | tar xzf -
rm -rf ace
mv ace-builds-master/src-min-noconflict ace
rm -rf ace/snippets
rm -rf ace-builds-master
