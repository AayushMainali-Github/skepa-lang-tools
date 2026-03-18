export interface LanguageItem {
  label: string;
  detail: string;
  documentation: string;
}

export interface BuiltinMember extends LanguageItem {
  packageName: string;
  signature: string;
}

export const KEYWORDS: LanguageItem[] = [
  {
    label: "import",
    detail: "Module import",
    documentation: "Import a module namespace such as `import string;`.",
  },
  {
    label: "from",
    detail: "Selective import",
    documentation: "Import selected exports, for example `from a.b import f as g;`.",
  },
  {
    label: "as",
    detail: "Alias keyword",
    documentation: "Rename an imported or exported symbol.",
  },
  {
    label: "export",
    detail: "Export declaration",
    documentation: "Export local or re-exported symbols from a module.",
  },
  {
    label: "struct",
    detail: "Struct declaration",
    documentation: "Declare a struct type with named fields.",
  },
  {
    label: "impl",
    detail: "Impl block",
    documentation: "Define methods for a struct inside an `impl` block.",
  },
  {
    label: "fn",
    detail: "Function declaration",
    documentation: "Declare a function or function literal.",
  },
  {
    label: "let",
    detail: "Variable binding",
    documentation: "Bind a value with optional type annotation.",
  },
  {
    label: "if",
    detail: "Conditional",
    documentation: "Execute a block when a boolean condition is true.",
  },
  {
    label: "else",
    detail: "Conditional branch",
    documentation: "Provide the alternate branch for an `if` statement.",
  },
  {
    label: "while",
    detail: "While loop",
    documentation: "Repeat a block while a boolean condition stays true.",
  },
  {
    label: "for",
    detail: "For loop",
    documentation: "C-style `for (init; condition; step)` loop.",
  },
  {
    label: "match",
    detail: "Match statement",
    documentation: "Branch on literal patterns with `=>` arms.",
  },
  {
    label: "break",
    detail: "Loop control",
    documentation: "Exit the nearest enclosing loop.",
  },
  {
    label: "continue",
    detail: "Loop control",
    documentation: "Skip to the next iteration of the nearest enclosing loop.",
  },
  {
    label: "return",
    detail: "Return statement",
    documentation: "Return a value from the current function.",
  },
  {
    label: "true",
    detail: "Boolean literal",
    documentation: "Boolean literal `true`.",
  },
  {
    label: "false",
    detail: "Boolean literal",
    documentation: "Boolean literal `false`.",
  },
];

export const TYPES: LanguageItem[] = [
  {
    label: "Int",
    detail: "Primitive type",
    documentation: "Signed integer primitive type.",
  },
  {
    label: "Float",
    detail: "Primitive type",
    documentation: "Floating-point primitive type.",
  },
  {
    label: "Bool",
    detail: "Primitive type",
    documentation: "Boolean primitive type.",
  },
  {
    label: "String",
    detail: "Primitive type",
    documentation: "UTF-8 string primitive type.",
  },
  {
    label: "Void",
    detail: "Primitive type",
    documentation: "Function return type used when no value is returned.",
  },
  {
    label: "Fn",
    detail: "Function type",
    documentation: "Function type syntax such as `Fn(Int, String) -> Bool`.",
  },
  {
    label: "Vec",
    detail: "Vector type",
    documentation: "Runtime-sized vector type written as `Vec[T]`.",
  },
];

export const BUILTIN_PACKAGES: LanguageItem[] = [
  {
    label: "io",
    detail: "Builtin package",
    documentation: "Printing, reading, and formatting helpers.",
  },
  {
    label: "str",
    detail: "Builtin package",
    documentation: "String helpers such as `len`, `trim`, and `toUpper`.",
  },
  {
    label: "arr",
    detail: "Builtin package",
    documentation: "Static array helpers such as `len`, `contains`, and `join`.",
  },
  {
    label: "datetime",
    detail: "Builtin package",
    documentation: "Unix time and date helper functions.",
  },
  {
    label: "random",
    detail: "Builtin package",
    documentation: "Deterministic random utilities with `seed`, `int`, and `float`.",
  },
  {
    label: "os",
    detail: "Builtin package",
    documentation: "Host OS helpers such as `cwd`, `platform`, and shell execution.",
  },
  {
    label: "fs",
    detail: "Builtin package",
    documentation: "Filesystem helpers such as `readText`, `writeText`, and `exists`.",
  },
  {
    label: "vec",
    detail: "Builtin package",
    documentation: "Runtime vector helpers such as `new`, `push`, `get`, and `set`.",
  },
];

export const ALL_LANGUAGE_ITEMS: LanguageItem[] = [
  ...KEYWORDS,
  ...TYPES,
  ...BUILTIN_PACKAGES,
];

export const BUILTIN_MEMBERS: BuiltinMember[] = [
  {
    packageName: "io",
    label: "print",
    signature: "io.print(s: String) -> Void",
    detail: "Builtin function",
    documentation: "Print a string without adding a trailing newline.",
  },
  {
    packageName: "io",
    label: "println",
    signature: "io.println(s: String) -> Void",
    detail: "Builtin function",
    documentation: "Print a string followed by a newline.",
  },
  {
    packageName: "io",
    label: "printInt",
    signature: "io.printInt(x: Int) -> Void",
    detail: "Builtin function",
    documentation: "Print an integer value.",
  },
  {
    packageName: "io",
    label: "printFloat",
    signature: "io.printFloat(x: Float) -> Void",
    detail: "Builtin function",
    documentation: "Print a floating-point value.",
  },
  {
    packageName: "io",
    label: "printBool",
    signature: "io.printBool(x: Bool) -> Void",
    detail: "Builtin function",
    documentation: "Print a boolean value.",
  },
  {
    packageName: "io",
    label: "printString",
    signature: "io.printString(x: String) -> Void",
    detail: "Builtin function",
    documentation: "Print a string value.",
  },
  {
    packageName: "io",
    label: "readLine",
    signature: "io.readLine() -> String",
    detail: "Builtin function",
    documentation: "Read a full line from standard input.",
  },
  {
    packageName: "io",
    label: "format",
    signature: "io.format(fmt: String, ...) -> String",
    detail: "Builtin function",
    documentation: "Format values into a string using `%d`, `%f`, `%s`, `%b`, and `%%`.",
  },
  {
    packageName: "io",
    label: "printf",
    signature: "io.printf(fmt: String, ...) -> Void",
    detail: "Builtin function",
    documentation: "Print formatted output directly.",
  },
  {
    packageName: "str",
    label: "len",
    signature: "str.len(s: String) -> Int",
    detail: "Builtin function",
    documentation: "Return string length.",
  },
  {
    packageName: "str",
    label: "contains",
    signature: "str.contains(s: String, needle: String) -> Bool",
    detail: "Builtin function",
    documentation: "Return whether a string contains a substring.",
  },
  {
    packageName: "str",
    label: "startsWith",
    signature: "str.startsWith(s: String, prefix: String) -> Bool",
    detail: "Builtin function",
    documentation: "Return whether a string starts with the provided prefix.",
  },
  {
    packageName: "str",
    label: "endsWith",
    signature: "str.endsWith(s: String, suffix: String) -> Bool",
    detail: "Builtin function",
    documentation: "Return whether a string ends with the provided suffix.",
  },
  {
    packageName: "str",
    label: "trim",
    signature: "str.trim(s: String) -> String",
    detail: "Builtin function",
    documentation: "Trim surrounding whitespace from a string.",
  },
  {
    packageName: "str",
    label: "toLower",
    signature: "str.toLower(s: String) -> String",
    detail: "Builtin function",
    documentation: "Convert a string to lowercase.",
  },
  {
    packageName: "str",
    label: "toUpper",
    signature: "str.toUpper(s: String) -> String",
    detail: "Builtin function",
    documentation: "Convert a string to uppercase.",
  },
  {
    packageName: "str",
    label: "indexOf",
    signature: "str.indexOf(s: String, needle: String) -> Int",
    detail: "Builtin function",
    documentation: "Find the first index of a substring.",
  },
  {
    packageName: "str",
    label: "lastIndexOf",
    signature: "str.lastIndexOf(s: String, needle: String) -> Int",
    detail: "Builtin function",
    documentation: "Find the last index of a substring.",
  },
  {
    packageName: "str",
    label: "slice",
    signature: "str.slice(s: String, start: Int, end: Int) -> String",
    detail: "Builtin function",
    documentation: "Return a substring slice.",
  },
  {
    packageName: "str",
    label: "replace",
    signature: "str.replace(s: String, from: String, to: String) -> String",
    detail: "Builtin function",
    documentation: "Replace occurrences of one string with another.",
  },
  {
    packageName: "str",
    label: "repeat",
    signature: "str.repeat(s: String, count: Int) -> String",
    detail: "Builtin function",
    documentation: "Repeat a string a number of times.",
  },
  {
    packageName: "str",
    label: "isEmpty",
    signature: "str.isEmpty(s: String) -> Bool",
    detail: "Builtin function",
    documentation: "Return whether a string is empty.",
  },
  {
    packageName: "arr",
    label: "len",
    signature: "arr.len(a: [T; N]) -> Int",
    detail: "Builtin function",
    documentation: "Return array length.",
  },
  {
    packageName: "arr",
    label: "isEmpty",
    signature: "arr.isEmpty(a: [T; N]) -> Bool",
    detail: "Builtin function",
    documentation: "Return whether a static array is empty.",
  },
  {
    packageName: "arr",
    label: "contains",
    signature: "arr.contains(a: [T; N], x: T) -> Bool",
    detail: "Builtin function",
    documentation: "Return whether an array contains a value.",
  },
  {
    packageName: "arr",
    label: "indexOf",
    signature: "arr.indexOf(a: [T; N], x: T) -> Int",
    detail: "Builtin function",
    documentation: "Find the first index of a value in an array.",
  },
  {
    packageName: "arr",
    label: "count",
    signature: "arr.count(a: [T; N], x: T) -> Int",
    detail: "Builtin function",
    documentation: "Count occurrences of a value in an array.",
  },
  {
    packageName: "arr",
    label: "first",
    signature: "arr.first(a: [T; N]) -> T",
    detail: "Builtin function",
    documentation: "Return the first element of an array.",
  },
  {
    packageName: "arr",
    label: "last",
    signature: "arr.last(a: [T; N]) -> T",
    detail: "Builtin function",
    documentation: "Return the last element of an array.",
  },
  {
    packageName: "arr",
    label: "join",
    signature: "arr.join(a: [String; N], sep: String) -> String",
    detail: "Builtin function",
    documentation: "Join a string array with a separator.",
  },
  {
    packageName: "datetime",
    label: "nowUnix",
    signature: "datetime.nowUnix() -> Int",
    detail: "Builtin function",
    documentation: "Return the current Unix timestamp in seconds.",
  },
  {
    packageName: "datetime",
    label: "nowMillis",
    signature: "datetime.nowMillis() -> Int",
    detail: "Builtin function",
    documentation: "Return the current Unix timestamp in milliseconds.",
  },
  {
    packageName: "datetime",
    label: "fromUnix",
    signature: "datetime.fromUnix(ts: Int) -> String",
    detail: "Builtin function",
    documentation: "Convert a Unix timestamp to an ISO-like string.",
  },
  {
    packageName: "datetime",
    label: "fromMillis",
    signature: "datetime.fromMillis(ms: Int) -> String",
    detail: "Builtin function",
    documentation: "Convert a millisecond timestamp to an ISO-like string.",
  },
  {
    packageName: "datetime",
    label: "parseUnix",
    signature: "datetime.parseUnix(s: String) -> Int",
    detail: "Builtin function",
    documentation: "Parse `YYYY-MM-DDTHH:MM:SSZ` into a Unix timestamp.",
  },
  {
    packageName: "datetime",
    label: "year",
    signature: "datetime.year(ts: Int) -> Int",
    detail: "Builtin function",
    documentation: "Extract the UTC year.",
  },
  {
    packageName: "datetime",
    label: "month",
    signature: "datetime.month(ts: Int) -> Int",
    detail: "Builtin function",
    documentation: "Extract the UTC month.",
  },
  {
    packageName: "datetime",
    label: "day",
    signature: "datetime.day(ts: Int) -> Int",
    detail: "Builtin function",
    documentation: "Extract the UTC day.",
  },
  {
    packageName: "datetime",
    label: "hour",
    signature: "datetime.hour(ts: Int) -> Int",
    detail: "Builtin function",
    documentation: "Extract the UTC hour.",
  },
  {
    packageName: "datetime",
    label: "minute",
    signature: "datetime.minute(ts: Int) -> Int",
    detail: "Builtin function",
    documentation: "Extract the UTC minute.",
  },
  {
    packageName: "datetime",
    label: "second",
    signature: "datetime.second(ts: Int) -> Int",
    detail: "Builtin function",
    documentation: "Extract the UTC second.",
  },
  {
    packageName: "random",
    label: "seed",
    signature: "random.seed(seed: Int) -> Void",
    detail: "Builtin function",
    documentation: "Seed the deterministic random generator.",
  },
  {
    packageName: "random",
    label: "int",
    signature: "random.int(min: Int, max: Int) -> Int",
    detail: "Builtin function",
    documentation: "Generate a random integer in the inclusive range.",
  },
  {
    packageName: "random",
    label: "float",
    signature: "random.float() -> Float",
    detail: "Builtin function",
    documentation: "Generate a random float in `[0.0, 1.0)`.",
  },
  {
    packageName: "os",
    label: "cwd",
    signature: "os.cwd() -> String",
    detail: "Builtin function",
    documentation: "Return the current working directory.",
  },
  {
    packageName: "os",
    label: "platform",
    signature: "os.platform() -> String",
    detail: "Builtin function",
    documentation: "Return `windows`, `linux`, or `macos`.",
  },
  {
    packageName: "os",
    label: "sleep",
    signature: "os.sleep(ms: Int) -> Void",
    detail: "Builtin function",
    documentation: "Block the current thread for a number of milliseconds.",
  },
  {
    packageName: "os",
    label: "execShell",
    signature: "os.execShell(cmd: String) -> Int",
    detail: "Builtin function",
    documentation: "Run a shell command and return its exit code.",
  },
  {
    packageName: "os",
    label: "execShellOut",
    signature: "os.execShellOut(cmd: String) -> String",
    detail: "Builtin function",
    documentation: "Run a shell command and capture stdout as a string.",
  },
  {
    packageName: "fs",
    label: "exists",
    signature: "fs.exists(path: String) -> Bool",
    detail: "Builtin function",
    documentation: "Check whether a file or directory exists.",
  },
  {
    packageName: "fs",
    label: "readText",
    signature: "fs.readText(path: String) -> String",
    detail: "Builtin function",
    documentation: "Read a UTF-8 text file.",
  },
  {
    packageName: "fs",
    label: "writeText",
    signature: "fs.writeText(path: String, data: String) -> Void",
    detail: "Builtin function",
    documentation: "Create or overwrite a text file.",
  },
  {
    packageName: "fs",
    label: "appendText",
    signature: "fs.appendText(path: String, data: String) -> Void",
    detail: "Builtin function",
    documentation: "Append text to a file, creating it if needed.",
  },
  {
    packageName: "fs",
    label: "mkdirAll",
    signature: "fs.mkdirAll(path: String) -> Void",
    detail: "Builtin function",
    documentation: "Recursively create directories.",
  },
  {
    packageName: "fs",
    label: "removeFile",
    signature: "fs.removeFile(path: String) -> Void",
    detail: "Builtin function",
    documentation: "Remove a file.",
  },
  {
    packageName: "fs",
    label: "removeDirAll",
    signature: "fs.removeDirAll(path: String) -> Void",
    detail: "Builtin function",
    documentation: "Recursively remove a directory tree.",
  },
  {
    packageName: "fs",
    label: "join",
    signature: "fs.join(a: String, b: String) -> String",
    detail: "Builtin function",
    documentation: "Join two path segments using host semantics.",
  },
  {
    packageName: "vec",
    label: "new",
    signature: "vec.new() -> Vec[T]",
    detail: "Builtin function",
    documentation: "Create a new runtime-sized vector in typed context.",
  },
  {
    packageName: "vec",
    label: "len",
    signature: "vec.len(v: Vec[T]) -> Int",
    detail: "Builtin function",
    documentation: "Return vector length.",
  },
  {
    packageName: "vec",
    label: "push",
    signature: "vec.push(v: Vec[T], x: T) -> Void",
    detail: "Builtin function",
    documentation: "Append a value to a vector.",
  },
  {
    packageName: "vec",
    label: "get",
    signature: "vec.get(v: Vec[T], i: Int) -> T",
    detail: "Builtin function",
    documentation: "Get the value at an index.",
  },
  {
    packageName: "vec",
    label: "set",
    signature: "vec.set(v: Vec[T], i: Int, x: T) -> Void",
    detail: "Builtin function",
    documentation: "Replace the value at an index.",
  },
  {
    packageName: "vec",
    label: "delete",
    signature: "vec.delete(v: Vec[T], i: Int) -> T",
    detail: "Builtin function",
    documentation: "Remove and return the value at an index.",
  },
];

export function getBuiltinMembers(packageName: string): BuiltinMember[] {
  return BUILTIN_MEMBERS.filter((member) => member.packageName === packageName);
}

export function getBuiltinPackage(packageName: string): LanguageItem | undefined {
  return BUILTIN_PACKAGES.find((item) => item.label === packageName);
}

export function getBuiltinMember(packageName: string, memberName: string): BuiltinMember | undefined {
  return BUILTIN_MEMBERS.find(
    (member) => member.packageName === packageName && member.label === memberName,
  );
}
