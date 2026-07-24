# SDE Mathematics RAG v0.2

This directory contains the runtime subset of the supplied
`SDE数学智能体专业RAG_v0.2` package.

Runtime files:

- `cards.jsonl`: 150 structured knowledge cards.
- `retrieval-routes.json`: grade and domain routing rules.
- `tag-taxonomy.json`: tag taxonomy.
- `system-prompt-v0.2.md`: original package system prompt for reference.
- `master-index.md`: readable card index.
- `PACKAGE-README.md`: original package overview.

The website loads the cards locally through `rag-retriever.js`. Retrieval is
performed before each model request and does not require an embedding API or a
separate vector database.
