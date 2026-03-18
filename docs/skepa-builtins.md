# Skepa Builtin Packages

## io
Printing, reading, and formatting helpers.

### io.print
`io.print(s: String) -> Void`

### io.println
`io.println(s: String) -> Void`

### io.printInt
`io.printInt(x: Int) -> Void`

### io.printFloat
`io.printFloat(x: Float) -> Void`

### io.printBool
`io.printBool(x: Bool) -> Void`

### io.printString
`io.printString(x: String) -> Void`

### io.readLine
`io.readLine() -> String`

### io.format
`io.format(fmt: String, ...) -> String`

### io.printf
`io.printf(fmt: String, ...) -> Void`

## str
String helpers.

### str.len
`str.len(s: String) -> Int`

### str.contains
`str.contains(s: String, needle: String) -> Bool`

### str.startsWith
`str.startsWith(s: String, prefix: String) -> Bool`

### str.endsWith
`str.endsWith(s: String, suffix: String) -> Bool`

### str.trim
`str.trim(s: String) -> String`

### str.toLower
`str.toLower(s: String) -> String`

### str.toUpper
`str.toUpper(s: String) -> String`

### str.indexOf
`str.indexOf(s: String, needle: String) -> Int`

### str.lastIndexOf
`str.lastIndexOf(s: String, needle: String) -> Int`

### str.slice
`str.slice(s: String, start: Int, end: Int) -> String`

### str.replace
`str.replace(s: String, from: String, to: String) -> String`

### str.repeat
`str.repeat(s: String, count: Int) -> String`

### str.isEmpty
`str.isEmpty(s: String) -> Bool`

## arr
Static-array helpers.

### arr.len
`arr.len(a: [T; N]) -> Int`

### arr.isEmpty
`arr.isEmpty(a: [T; N]) -> Bool`

### arr.contains
`arr.contains(a: [T; N], x: T) -> Bool`

### arr.indexOf
`arr.indexOf(a: [T; N], x: T) -> Int`

### arr.count
`arr.count(a: [T; N], x: T) -> Int`

### arr.first
`arr.first(a: [T; N]) -> T`

### arr.last
`arr.last(a: [T; N]) -> T`

### arr.join
`arr.join(a: [String; N], sep: String) -> String`

## datetime
Unix timestamp and UTC date helpers.

### datetime.nowUnix
`datetime.nowUnix() -> Int`

### datetime.nowMillis
`datetime.nowMillis() -> Int`

### datetime.fromUnix
`datetime.fromUnix(ts: Int) -> String`

### datetime.fromMillis
`datetime.fromMillis(ms: Int) -> String`

### datetime.parseUnix
`datetime.parseUnix(s: String) -> Int`

### datetime.year
`datetime.year(ts: Int) -> Int`

### datetime.month
`datetime.month(ts: Int) -> Int`

### datetime.day
`datetime.day(ts: Int) -> Int`

### datetime.hour
`datetime.hour(ts: Int) -> Int`

### datetime.minute
`datetime.minute(ts: Int) -> Int`

### datetime.second
`datetime.second(ts: Int) -> Int`

## random
Deterministic random helpers.

### random.seed
`random.seed(seed: Int) -> Void`

### random.int
`random.int(min: Int, max: Int) -> Int`

### random.float
`random.float() -> Float`

## os
Host operating-system helpers.

### os.cwd
`os.cwd() -> String`

### os.platform
`os.platform() -> String`

### os.sleep
`os.sleep(ms: Int) -> Void`

### os.execShell
`os.execShell(cmd: String) -> Int`

### os.execShellOut
`os.execShellOut(cmd: String) -> String`

## fs
Filesystem helpers.

### fs.exists
`fs.exists(path: String) -> Bool`

### fs.readText
`fs.readText(path: String) -> String`

### fs.writeText
`fs.writeText(path: String, data: String) -> Void`

### fs.appendText
`fs.appendText(path: String, data: String) -> Void`

### fs.mkdirAll
`fs.mkdirAll(path: String) -> Void`

### fs.removeFile
`fs.removeFile(path: String) -> Void`

### fs.removeDirAll
`fs.removeDirAll(path: String) -> Void`

### fs.join
`fs.join(a: String, b: String) -> String`

## vec
Runtime-sized vector helpers.

### vec.new
`vec.new() -> Vec[T]`

### vec.len
`vec.len(v: Vec[T]) -> Int`

### vec.push
`vec.push(v: Vec[T], x: T) -> Void`

### vec.get
`vec.get(v: Vec[T], i: Int) -> T`

### vec.set
`vec.set(v: Vec[T], i: Int, x: T) -> Void`

### vec.delete
`vec.delete(v: Vec[T], i: Int) -> T`
