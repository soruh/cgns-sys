const input = require("fs")
  .readFileSync(0)
  .toString();

const midlevel_docs_url = "https://cgns.github.io/CGNS_docs_current/midlevel/";
const dest_filename = "../src/cgns.rs";
let dest = require("fs")
  .readFileSync(dest_filename)
  .toString();

let docs = {};

let inner_tables = [];

get_short_explainations(input);
get_table_data(input);
apply_docs();

function create_comment_from_doc(documentation) {
  let res = [];

  res.push(documentation.short || "missing summary");
  if (documentation.modes) {
    res.push(`# Modes`);
    res.push("[ " + documentation.modes.join(" ") + " ]");
  }

  // TODO: use `documentation.variadic`?

  if (documentation.args) {
    res.push("# Arguments");
    for (arg of documentation.args) {
      let explaination_lines = arg.explaination
        ? arg.explaination.split("\n")
        : ["?"];
      res.push(
        (arg.direction == "in" ? "&rarr;" : "&larr;") +
          " `" +
          arg.name +
          "`(`" +
          arg.type +
          "`): " +
          explaination_lines[0]
      );

      res.concat(explaination_lines.slice(1));
    }
  }

  let res_padded = [];
  for (line of res) {
    res_padded.push("");
    res_padded.push(line);
  }

  res_padded = res_padded.filter((x, i, total) => {
    if (x.trim()) {
      return true;
    } else {
      return !(total[+i] && total[+i].trim());
    }
  });

  return res_padded;
}

function apply_docs() {
  for (let function_name in docs) {
    let function_start = dest.indexOf("pub fn " + function_name);
    let line_start = dest.lastIndexOf("\n", function_start);
    let white_space = dest.slice(line_start, function_start);

    let documentation_for_function = create_comment_from_doc(
      docs[function_name]
    ).join(white_space + "/// ");

    documentation_for_function = documentation_for_function.replace(
      /<a href="([^"]+)">/g,
      "<a href=" + midlevel_docs_url + "$1>"
    );

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

  let i = 0;

  let n = 0;
  let outer_table_start;
  while (i < input.length) {
    let table_start = input.indexOf("<table", i);
    let table_end = input.indexOf("</table>", i);

    if (!~table_end || !~table_start) {
      break;
    }

    if (table_start < table_end) {
      if (n++ == 0) {
        outer_table_start = table_start;
      }
      i = table_start + 1;
    } else {
      if (--n == 0) {
        let outer_table = input
          .slice(input.indexOf(">", outer_table_start + 6) + 1, table_end)
          .trim();

        let inner_table_start = outer_table.indexOf("<table");
        if (~inner_table_start) {
          let inner_table_end = outer_table.indexOf("</table>");

          inner_tables.push(
            outer_table
              .slice(
                outer_table.indexOf(">", inner_table_start + 6) + 1,
                inner_table_end
              )
              .trim()
          );

          outer_table =
            outer_table.slice(0, inner_table_start) +
            "<<<" +
            (inner_tables.length - 1) +
            ">>>" +
            outer_table.slice(inner_table_end + 8);
        }

        tables.push(outer_table);
      } else if (n == 1) {
        inner_table_end = table_end;
      }

      i = table_end + 1;
    }
  }

  for (let i in tables) {
    let input = tables[i];

    let tbody_index = input.indexOf("<tbody>");
    let thead_index = input.indexOf("<thead>");
    if (~thead_index && ~tbody_index) {
      let head = input.slice(thead_index + 7, tbody_index);
      let body = input.slice(tbody_index + 7);
      if (~head.indexOf("Functions") && ~head.indexOf("Modes")) {
        let next_body = body.indexOf("<tbody>");
        if (~next_body) body = body.slice(0, next_body); // ignore fortran docs

        tables[i] = { is_def: true, body };
      }
    } else {
      tables[i] = { is_def: false, body: input };
    }
  }

  let pairs = [];
  let orphans = [];

  for (let i = 0; i < tables.length; i++) {
    if (tables[i].is_def) {
      if (tables[i + 1] && !tables[i + 1].is_def) {
        pairs.push([tables[i].body, tables[i + 1].body]);
        i++;
      } else {
        // console.log("\n\n\ntable has no explaination");
        // console.log(tables[i]);
        // console.log("-".repeat(100));
        // console.log(tables[i + 1]);
      }
    } else {
      orphans.push(tables[i].body);
    }
  }

  for ([raw_signatures, raw_explainations] of pairs) {
    let signatures = get_function_signatures(raw_signatures);

    ammend_parameter_explainations(signatures, raw_explainations);

    for (function_name in signatures) {
      if (!docs[function_name]) docs[function_name] = {};
      docs[function_name].args = signatures[function_name].args;
      docs[function_name].modes = signatures[function_name].modes;
      docs[function_name].variadic = signatures[function_name].variadic;
    }
  }

  // TODO: handle orphans
  // console.log(orphans);
}

function inner_table_to_comment(table) {
  let res = "";
  let rows = table
    .split(/<tr[^>]*>/)
    .slice(1)
    .map(x => x.trim())
    .filter(x => x);

  let header = rows[0];

  let ths = header
    .split(/<th/)
    .slice(1)
    .map(x => {
      let end = x.indexOf("</");
      return x.slice(x.indexOf(">") + 1, ~end ? end : undefined);
    })
    .map(x => x.trim());

  res += ths.join(" | ") + "</br>";

  let body = rows.slice(1);

  for (let row of body) {
    let tds = row
      .split(/<td/)
      .slice(1)
      .map(x => {
        let end = x.indexOf("</td>");
        return x.slice(x.indexOf(">") + 1, ~end ? end : undefined);
      })
      .map(x => x.trim())
      .filter(x => x);

    res += tds.join(" | ") + "</br>";
  }

  return res;
}

function get_function_signatures(table_body) {
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
    let signature_arguments = signature.slice(paren_index + 1);

    let arg_regex = /<span class=(in|out)>(?:<i>)?([^<]+)(?:<\/i>)?<\/span>/gim;
    let args = [];
    let variadic = false;
    while (true) {
      let match = arg_regex.exec(signature_arguments);
      if (!match) break;

      if (match[2] == "...") {
        variadic = true;
        break;
      }
      let type_and_name = match[2].trim();

      if (~type_and_name.indexOf("(")) continue;

      let start_of_name = type_and_name.lastIndexOf(" ");
      let last_asterix = type_and_name.lastIndexOf("*");
      if (~last_asterix) start_of_name = last_asterix;
      start_of_name += 1;

      let arg_type = type_and_name.slice(0, start_of_name).trim();
      let arg_name = type_and_name.slice(start_of_name).trim();
      arg_type = arg_type.replace(/\s+\*/, "*");

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
      .map(x => {
        let i = x.indexOf("</td");
        if (~i) return x.slice(0, i);
        return x;
      })
      .map(x => x.replace(/<(?:tt|zz)>([^<]+)<\/(?:tt|zz)>/g, "`$1`"))
      .map(x => x.trim())
      .filter(x => x)
      .map(x =>
        x.replace(/<<<(\d+)>>>/g, (_, table_index) => {
          console.log("#".repeat(100));
          console.log(row);

          return inner_table_to_comment(inner_tables[+table_index]);
        })
      )
      .map(x =>
        x
          .split("\n")
          .map(x => x.trim())
          .join(" ")
      )
      .map(x => x.trim())
      .filter(x => x)
      .map(x => x.replace(/^`([^`]*)`$/, "$1"))
      .map(x => x.replace(/<(\/)?i>/g, "_"))
      .map(x => x.replace(/<(\/)?p>/g, ""))
      .map(x => x.trim())
      .filter(x => x)
      .map(x => x.replace(/<(\/)?br>/g, "\n"));

    let [name, explaination] = cells;
    for (function_name in signatures) {
      for (arg of signatures[function_name].args) {
        if (arg.name == name) {
          arg.explaination = explaination;
        }
      }
    }
  }
}
