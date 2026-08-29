import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SCAN_ROOTS = [resolve(ROOT, "src"), resolve(ROOT, "scripts")];
const THIS_FILE = resolve(import.meta.filename);
const CLASSIC_LIMIT = 10;
const STRICT_LIMIT = 20;
const STRICT_WARNING = 15;
const NESTING_LIMIT = 4;

const files = (await Promise.all(SCAN_ROOTS.map(walk)))
    .flat()
    .filter(path => path.endsWith(".ts") || path.endsWith(".js"))
    .filter(path => !path.includes(".test.") && !path.endsWith(".d.ts"))
    .filter(path => path !== THIS_FILE);
const functions = [];

for (const file of files) {
    const source = await readFile(file, "utf8");
    const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS
    );
    collectFunctions(sourceFile, file, functions);
}

const violations = functions.filter(result => (
    result.classic > CLASSIC_LIMIT
    || result.strict > STRICT_LIMIT
    || result.nesting > NESTING_LIMIT
));
const warnings = functions.filter(result => (
    result.strict > STRICT_WARNING && !violations.includes(result)
));
const maxima = functions.reduce((current, result) => ({
    classic: Math.max(current.classic, result.classic),
    strict: Math.max(current.strict, result.strict),
    nesting: Math.max(current.nesting, result.nesting)
}), { classic: 0, strict: 0, nesting: 0 });

console.log(
    `Cyclomatic complexity verified (${files.length} files, ${functions.length} functions; `
    + `maxima: classic ${maxima.classic}, strict ${maxima.strict}, nesting ${maxima.nesting}; `
    + `limits: ${CLASSIC_LIMIT}/${STRICT_LIMIT}/${NESTING_LIMIT}).`
);
printResults("Warning", warnings);
printResults("Violation", violations);

if (violations.length > 0) {
    process.exit(1);
}

async function walk(directory) {
    const entries = await readdir(directory);
    const nested = await Promise.all(entries.map(async entry => {
        const path = resolve(directory, entry);
        return (await stat(path)).isDirectory() ? walk(path) : [path];
    }));
    return nested.flat();
}

function collectFunctions(sourceFile, file, results) {
    function visit(node) {
        if (ts.isFunctionLike(node) && node.body) {
            results.push(analyzeFunction(sourceFile, file, node));
        }
        ts.forEachChild(node, visit);
    }
    visit(sourceFile);
}

function analyzeFunction(sourceFile, file, functionNode) {
    const metrics = { classic: 1, strict: 1, nesting: 0 };

    function visit(node, depth) {
        if (node !== functionNode && ts.isFunctionLike(node)) {
            return;
        }
        const decision = isClassicDecision(node);
        const nextDepth = decision ? depth + 1 : depth;
        if (decision) {
            metrics.classic += 1;
            metrics.strict += 1;
            metrics.nesting = Math.max(metrics.nesting, nextDepth);
        }
        if (isBooleanBranch(node)) {
            metrics.strict += 1;
        }
        ts.forEachChild(node, child => visit(child, nextDepth));
    }

    visit(functionNode.body, 0);
    const location = sourceFile.getLineAndCharacterOfPosition(functionNode.getStart(sourceFile));
    return {
        file: display(file),
        line: location.line + 1,
        name: getFunctionName(functionNode),
        ...metrics
    };
}

function isClassicDecision(node) {
    return ts.isIfStatement(node)
        || ts.isForStatement(node)
        || ts.isForInStatement(node)
        || ts.isForOfStatement(node)
        || ts.isWhileStatement(node)
        || ts.isDoStatement(node)
        || ts.isCatchClause(node)
        || ts.isCaseClause(node)
        || ts.isConditionalExpression(node);
}

function isBooleanBranch(node) {
    if (!ts.isBinaryExpression(node)) {
        return false;
    }
    return node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
        || node.operatorToken.kind === ts.SyntaxKind.BarBarToken
        || node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken;
}

function getFunctionName(node) {
    if (node.name && ts.isIdentifier(node.name)) {
        return node.name.text;
    }
    if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
        return node.parent.name.text;
    }
    if (ts.isPropertyAssignment(node.parent) && ts.isIdentifier(node.parent.name)) {
        return node.parent.name.text;
    }
    return "<anonymous>";
}

function printResults(label, results) {
    const sorted = [...results].sort((left, right) => (
        right.classic - left.classic
        || right.strict - left.strict
        || left.file.localeCompare(right.file)
        || left.line - right.line
    ));
    for (const result of sorted) {
        console.error(
            `${label}: ${result.file}:${result.line} ${result.name} `
            + `(classic ${result.classic}, strict ${result.strict}, nesting ${result.nesting})`
        );
    }
}

function display(path) {
    return relative(ROOT, path).split(sep).join("/");
}
