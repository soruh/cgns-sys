const input = require("fs")
  .readFileSync(0)
  .toString();

const dest_filename = "../src/cgns.rs";
let dest = require("fs")
  .readFileSync(dest_filename)
  .toString();

let docs = {};

get_short_explainations(input);
get_table_data(input);
apply_docs();

function create_comment_from_doc(documentation) {
  let res = [""];

  if (documentation.short) res.push(documentation.short);
  if (documentation.modes)
    res.push(`modes: [ ${documentation.modes.join(" ")} ]`);

  // TODO: use `documentation.variadic`?

  if (documentation.args) {
    res.push("arguments: ");
    for (arg of documentation.args) {
      res.push(
        (arg.direction == "in" ? "->" : "<-") +
          " `" +
          arg.name +
          "`(`" +
          arg.type +
          "`): " +
          arg.explaination
      );
    }
  }

  return res;
}

function apply_docs() {
  for (let function_name in docs) {
    let function_start = dest.indexOf("pub fn " + function_name);
    let line_start = dest.lastIndexOf("\n", function_start);
    let white_space = dest.slice(line_start, function_start);

    let documentation_for_function = create_comment_from_doc(
      docs[function_name]
    ).join(white_space + "/// ");

    dest = [
      dest.slice(0, line_start),
      documentation_for_function,
      dest.slice(line_start)
    ].join("");
  }

  require("fs").writeFileSync(dest_filename, dest);
}

function get_short_explainations(input) {
  let regex = /<tt><b>(cg_[^<]+)<\/b><\/tt> - ([^<]+)<\//g;
  let match;
  while (true) {
    match = regex.exec(input);
    if (!match) break;

    let name = match[1].trim();
    let explaination = match[2].trim();

    if (!docs[name]) docs[name] = {};
    docs[name].short = explaination;
  }
}

function get_table_data(input) {
  let tables = [];

  let regex = /<table[^>]*>(([^](?!<\/table>))*[^])<\/table>/gim;
  let match;
  while (true) {
    match = regex.exec(input);
    if (!match) break;

    let table_content = match[1];

    let tbody_index = table_content.indexOf("<tbody>");
    if (~tbody_index) {
      let table_header = table_content.slice(0, tbody_index);
      let table_body = table_content.slice(tbody_index + "<tbody>".length);

      tables.push([table_header, table_body]);
    } else {
      tables.push(table_content);
    }
  }

  /*
  console.log(
    tables
      .map(x => (x.length == 2 ? x.join("\n" + "-".repeat(100)) : x))
      .join("\n" + "#".repeat(100))
  );

  console.log(tables.map(x => x.length == 2));
  */

  let pairs = [];
  let orphans = [];

  for (let i = 0; i < tables.length; i++) {
    if (tables[i].length == 2) {
      if (tables[i + 1] && tables[i + 1].length != 2) {
        pairs.push([tables[i], tables[i + 1]]);
        i++;
      } else {
        // console.log("\n\n\ntable has no explaination");
        // console.log(tables[i]);
        // console.log("-".repeat(100));
        // console.log(tables[i + 1]);
      }
    } else {
      orphans.push(tables[i]);
    }
  }

  for ([raw_signatures, raw_explainations] of pairs) {
    let signatures = get_function_signatures(
      raw_signatures[0],
      raw_signatures[1]
    );

    ammend_parameter_explainations(signatures, raw_explainations);

    for (function_name in signatures) {
      if (!docs[function_name]) docs[function_name] = {};
      docs[function_name].args = signatures[function_name].args;
      docs[function_name].modes = signatures[function_name].modes;
      docs[function_name].variadic = signatures[function_name].variadic;
    }
  }

  // TODO: orphans
}

function get_function_signatures(table_header, table_body) {
  if (!(~table_header.indexOf("Functions") && ~table_header.indexOf("Modes"))) {
    console.error("skipping a table:");
    console.error(table_header);
    console.error(table_body);
  }

  let rows = table_body
    .trim()
    .split(/<tr[^>]*>/)
    .slice(1)
    .map(x => x.trim())
    .filter(x => x);

  let signatures = {};

  for (let row of rows) {
    let [signature, modes] = row
      .split(/<td[^>]*>/)
      .slice(1)
      .map(x => x.trim())
      .filter(x => x);

    let [pre, ...post] = signature.split("cg_");
    signature = "cg_" + post.join("cg_");
    if (~pre.indexOf("call")) break;

    let paren_index = signature.indexOf("(");
    let name = signature.slice(0, paren_index);
    signature = signature.slice(paren_index + 1);

    let arg_regex = /<span class=(in|out)>(?:<i>)?([^<]+)(?:<\/i>)?<\/span>/gim;
    let args = [];
    let variadic = false;
    while (true) {
      let match = arg_regex.exec(signature);
      if (!match) break;

      if (match[2] == "...") {
        variadic = true;
        break;
      }
      let [arg_type, arg_name] = /([^ ]+ \**)([^*]*)/.exec(match[2]).slice(1);
      arg_type = arg_type.replace(/\s/g, "");

      args.push({
        direction: match[1],
        name: arg_name,
        type: arg_type
      });
    }

    modes = /(r|-)&nbsp;(w|-)&nbsp;(m|-)/.exec(modes).slice(1);

    signatures[name] = {
      args,
      modes,
      variadic
    };
  }

  return signatures;
}

function ammend_parameter_explainations(signatures, explainations) {
  explainations = explainations.replace(/&nbsp;/g, " ");
  let rows = explainations
    .split(/<tr[^>]*>/g)
    .map(x => x.trim())
    .filter(x => x);

  for (let row of rows) {
    let cells = row
      .split(/<td[^>]*>/g)
      .map(x => x.replace(/<tt>([^<]+)<\/tt>/g, "`$1`"))
      .map(x => x.trim())
      .map(x => x.replace(/^`([^`]*)`$/, "$1"))
      .map(x => x.trim())
      .filter(x => x)
      .map(x =>
        x
          .split("\n")
          .map(x => x.trim())
          .join(" ")
      );

    let [name, explaination] = cells;
    for (function_name in signatures) {
      for (arg of signatures[function_name].args) {
        if (arg.name == name) arg.explaination = explaination;
      }
    }
  }
}
