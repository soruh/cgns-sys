#!/bin/sh

cd $(dirname $0)/..


# TODO: get header files from source

bindgen include/cgnslib.h -o src/cgns.rs
bindgen include/cgns_io.h -o src/cgio.rs

creation/document.sh