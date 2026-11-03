# 3dev editor

Editor 3D paramétrico para desktop. A modelagem acontece numa vista isométrica e o aplicativo gera OpenSCAD com [BOSL2](https://github.com/BelfrySCAD/BOSL2). O código pode ser editado e volta para a cena.

Feito com Electron, React, TypeScript, Three.js e Monaco. O gerenciador de pacotes do projeto é o `pnpm`.

![Cubo, cilindro e esfera no viewport isométrico](docs/images/05-tres-solidos.png)

## Executar

```bash
pnpm install
pnpm dev
```

A prévia exata, a exportação STL e os diálogos de arquivo rodam na janela Electron. O OpenSCAD precisa estar instalado para esses caminhos. A prévia rápida, feita com Three.js e Manifold, funciona sem ele.

```bash
pnpm build:mac
pnpm build:win
pnpm build:linux
```

## O que a janela faz

- **Modelo:** árvore de cubos, cilindros, esferas e operações booleanas.
- **Ferramentas:** selecionar, mover, girar, escalar, criar primitivas e aplicar união, diferença ou interseção.
- **Viewport:** grade em milímetros, eixo Z para cima, órbita com o botão direito.
- **OpenSCAD:** fonte gerado em tempo real, com edição de volta para o modelo.
- **Propriedades:** posição, rotação, dimensões, cor, opacidade e trava.

O guia completo, com a câmera, o formato do documento, as duas prévias e o mapa do código, está em [docs/como-funciona.md](docs/como-funciona.md).

![Editor vazio](docs/images/01-editor-vazio.png)
