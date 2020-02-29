#!/bin/sh

cd $(dirname $0)

midlevel="https://cgns.github.io/CGNS_docs_current/midlevel"

urls=$(curl -s $midlevel/index.html | node filter_index.js $midlevel)



input=$(curl -s $urls);


node extract_data.js <<< $input

