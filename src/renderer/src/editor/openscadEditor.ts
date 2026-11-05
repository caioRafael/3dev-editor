import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import * as monaco from 'monaco-editor/editor/editor.api.js'
import '../../../../node_modules/monaco-editor/min/vs/editor/editor.main.css'

const LANGUAGE = 'openscad'
const THEME = '3dev'

interface Snippet {
  label: string
  detail: string
  insertText: string
}

const SNIPPETS: Snippet[] = [
  {
    label: 'cuboid',
    detail: 'Cubo BOSL2',
    insertText: 'cuboid([${1:20}, ${2:20}, ${3:20}], anchor=CENTER);'
  },
  {
    label: 'cyl',
    detail: 'Cilindro BOSL2',
    insertText: 'cyl(h=${1:20}, d=${2:12}, anchor=CENTER);'
  },
  {
    label: 'spheroid',
    detail: 'Esfera BOSL2',
    insertText: 'spheroid(d=${1:16}, anchor=CENTER);'
  },
  {
    label: 'translate',
    detail: 'Posição',
    insertText: 'translate([${1:0}, ${2:0}, ${3:0}])\n    $0'
  },
  {
    label: 'rotate',
    detail: 'Rotação em graus',
    insertText: 'rotate([${1:0}, ${2:0}, ${3:0}])\n    $0'
  },
  {
    label: 'color',
    detail: 'Cor da prévia',
    insertText: 'color("${1:#d97757}")\n    $0'
  },
  {
    label: 'round3d',
    detail: 'Arredondamento da peça',
    insertText: 'round3d(r=${1:2}) {\n    $0\n}'
  },
  {
    label: 'difference',
    detail: 'Diferença',
    insertText: 'difference() {\n    $0\n}'
  },
  {
    label: 'union',
    detail: 'União',
    insertText: 'union() {\n    $0\n}'
  },
  {
    label: 'intersection',
    detail: 'Interseção',
    insertText: 'intersection() {\n    $0\n}'
  },
  {
    label: 'offset',
    detail: 'Offset 2D',
    insertText: 'offset(r=${1:1}) {\n    $0\n}'
  },
  {
    label: 'hull',
    detail: 'Casca convexa',
    insertText: 'hull() {\n    $0\n}'
  },
  {
    label: 'mirror',
    detail: 'Espelho',
    insertText: 'mirror([${1:1}, ${2:0}, ${3:0}]) {\n    $0\n}'
  },
  {
    label: 'rotate_extrude',
    detail: 'Revolução',
    insertText: 'rotate_extrude(angle=${1:360}) {\n    $0\n}'
  },
  {
    label: 'projection',
    detail: 'Projeção',
    insertText: 'projection(cut=${1:false}) {\n    $0\n}'
  },
  {
    label: 'resize',
    detail: 'Redimensionar',
    insertText: 'resize([${1:20}, ${2:20}, ${3:20}], auto=${4:false}) {\n    $0\n}'
  },
  {
    label: 'minkowski',
    detail: 'Minkowski',
    insertText: 'minkowski() {\n    $0\n}'
  }
]

let configured = false

export function createOpenscadEditor(
  container: HTMLElement,
  value: string
): monaco.editor.IStandaloneCodeEditor {
  ensureMonaco()
  return monaco.editor.create(container, {
    value,
    language: LANGUAGE,
    theme: THEME,
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 12,
    lineHeight: 20,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    scrollBeyondLastLine: false,
    tabSize: 4,
    padding: { top: 8, bottom: 8 },
    renderLineHighlight: 'line',
    overviewRulerLanes: 0,
    hideCursorInOverviewRuler: true,
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    fixedOverflowWidgets: true,
    wordWrap: 'off',
    ariaLabel: 'Código OpenSCAD',
    'semanticHighlighting.enabled': false
  })
}

export function setOpenscadMarkers(
  editor: monaco.editor.IStandaloneCodeEditor,
  error: { message: string; line: number; column: number } | null
): void {
  const model = editor.getModel()
  if (!model) return
  if (!error) {
    monaco.editor.setModelMarkers(model, LANGUAGE, [])
    return
  }
  monaco.editor.setModelMarkers(model, LANGUAGE, [
    {
      severity: monaco.MarkerSeverity.Error,
      message: error.message,
      startLineNumber: error.line,
      startColumn: error.column,
      endLineNumber: error.line,
      endColumn: error.column + 1
    }
  ])
}

function ensureMonaco(): void {
  if (configured) return
  configured = true
  globalThis.MonacoEnvironment = {
    getWorker() {
      return new editorWorker()
    }
  }
  monaco.languages.register({ id: LANGUAGE })
  monaco.languages.setLanguageConfiguration(LANGUAGE, {
    comments: { lineComment: '//', blockComment: ['/*', '*/'] },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')']
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' }
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' }
    ]
  })
  monaco.languages.setMonarchTokensProvider(LANGUAGE, {
    keywords: [
      'include',
      'use',
      'module',
      'function',
      'if',
      'else',
      'for',
      'let',
      'union',
      'difference',
      'intersection',
      'translate',
      'rotate',
      'scale',
      'color',
      'hull',
      'minkowski',
      'mirror',
      'linear_extrude',
      'rotate_extrude',
      'projection',
      'render',
      'children',
      'echo',
      'assert'
    ],
    functions: [
      'cuboid',
      'cyl',
      'spheroid',
      'round3d',
      'cube',
      'cylinder',
      'sphere',
      'square',
      'circle',
      'polygon',
      'polyhedron',
      'text',
      'offset',
      'resize'
    ],
    constants: [
      'CENTER',
      'true',
      'false',
      'undef',
      'TOP',
      'BOTTOM',
      'LEFT',
      'RIGHT',
      'FRONT',
      'BACK'
    ],
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\/\*/, 'comment', '@comment'],
        [/"([^"\\]|\\.)*$/, 'string.invalid'],
        [/"/, 'string', '@string'],
        [/\$[A-Za-z_]\w*/, 'variable.predefined'],
        [
          /[A-Za-z_]\w*/,
          {
            cases: {
              '@keywords': 'keyword',
              '@functions': 'type',
              '@constants': 'keyword',
              '@default': 'identifier'
            }
          }
        ],
        [/-?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?/, 'number'],
        [/[{}()[\]]/, 'delimiter.bracket'],
        [/[;,.]/, 'delimiter'],
        [/[<>=+\-*/%!]+/, 'operator']
      ],
      comment: [
        [/[^/*]+/, 'comment'],
        [/\*\//, 'comment', '@pop'],
        [/[/*]/, 'comment']
      ],
      string: [
        [/[^\\"]+/, 'string'],
        [/\\./, 'string.escape'],
        [/"/, 'string', '@pop']
      ]
    }
  })
  monaco.languages.registerCompletionItemProvider(LANGUAGE, {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range: monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }
      return {
        suggestions: SNIPPETS.map((snippet) => ({
          label: snippet.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          detail: snippet.detail,
          insertText: snippet.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range
        }))
      }
    }
  })
  monaco.editor.defineTheme(THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '8b93a3', fontStyle: 'italic' },
      { token: 'string', foreground: '6fbf73' },
      { token: 'string.escape', foreground: '6fbf73' },
      { token: 'number', foreground: 'e0b44f' },
      { token: 'keyword', foreground: 'd97757' },
      { token: 'variable.predefined', foreground: 'b07cc6' },
      { token: 'type', foreground: '5b8def' },
      { token: 'identifier', foreground: 'd5dbe6' },
      { token: 'operator', foreground: '9aa3b2' },
      { token: 'delimiter', foreground: '9aa3b2' },
      { token: 'delimiter.bracket', foreground: '9aa3b2' }
    ],
    colors: {
      'editor.background': '#14171e',
      'editor.foreground': '#d5dbe6',
      'editorGutter.background': '#14171e',
      'editorLineNumber.foreground': '#6a7384',
      'editorLineNumber.activeForeground': '#d5dbe6',
      'editor.lineHighlightBackground': '#1b1e27',
      'editor.selectionBackground': '#343c4e',
      'editor.inactiveSelectionBackground': '#2a3040',
      'editorCursor.foreground': '#d97757',
      'editorWidget.background': '#1b1e27',
      'editorWidget.border': '#2c3240',
      'editorSuggestWidget.background': '#1b1e27',
      'editorSuggestWidget.border': '#2c3240',
      'editorSuggestWidget.foreground': '#d5dbe6',
      'editorSuggestWidget.selectedBackground': '#343c4e',
      'editorSuggestWidget.highlightForeground': '#d97757',
      'editorHoverWidget.background': '#1b1e27',
      'editorHoverWidget.border': '#2c3240',
      'scrollbarSlider.background': '#3a415080',
      'scrollbarSlider.hoverBackground': '#3a4150',
      'editorIndentGuide.background1': '#2c3240',
      'editorIndentGuide.activeBackground1': '#3a4152'
    }
  })
}
