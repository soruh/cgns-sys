bindgen command used to generate FFI-bindings:

```
bindgen include/cgnslib.h -o src/cgns.rs
bindgen include/cgns_io.h -o src/cgio.rs
```
