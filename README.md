# 3dev editor

Editor 3D paramétrico para desktop. A modelagem acontece numa vista isométrica e o aplicativo gera OpenSCAD com [BOSL2](https://github.com/BelfrySCAD/BOSL2). O código pode ser editado e volta para a cena.

Um projeto é uma pasta, com o documento, o `main.scad`, componentes e o STL. Feito com Electron, React, TypeScript, Three.js e Monaco. O gerenciador de pacotes do projeto é o `pnpm`.

![Cilindro, cubo, esfera e polígono extrudado, com o gizmo de mover](docs/images/05-tres-solidos.png)

## Executar

```bash
pnpm install
pnpm dev
```

A prévia exata, a exportação STL, a importação de SVG e os diálogos de arquivo rodam na janela Electron. O OpenSCAD precisa estar instalado para a prévia exata e para o STL. A prévia rápida, feita com Three.js e Manifold, funciona sem ele.

```bash
pnpm build:mac
pnpm build:win
pnpm build:linux
```

## O que a janela faz

- **Projeto:** modal para criar, abrir ou retomar um recente. A coluna esquerda mostra o modelo e a pasta (`code`, `components`, `output`).
- **Formas:** cubo, cilindro, esfera, retângulo, círculo, elipse, polígono, estrela, texto e SVG. Perfis 2D são extrudados.
- **Ferramentas:** selecionar, mover, girar, escalar e aplicar união, diferença ou interseção.
- **Componentes:** cada um é um módulo OpenSCAD e pode ser instanciado na cena.
- **OpenSCAD:** fonte gerado em tempo real, com edição de volta para o modelo.
- **Propriedades:** posição, rotação, dimensões, extrusão, cor, opacidade e trava.

O guia completo, com a câmera, o formato do documento, as duas prévias e o mapa do código, está em [docs/como-funciona.md](docs/como-funciona.md).

![Menu de formas 3D e 2D sobre a cena atual](docs/images/03-menu-formas.png)
