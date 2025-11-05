# Gemini Code Assistant Context: Ling Atlas

This document provides context for the "Ling Atlas" project, a sophisticated, polyglot knowledge base system.

## Project Overview

Ling Atlas is an advanced personal knowledge base project designed to be modern, evolvable, and highly searchable. It combines a static-site frontend with a powerful backend for knowledge extraction and graph-based data management. The project is built with a "protocol-first, content-is-king" philosophy, emphasizing structured data, automation, and both lexical and semantic search capabilities.

The project has two main components:

1.  **VitePress Static Site:** The primary user-facing component is a documentation site built with VitePress. It serves Markdown-based content and features multi-language support (English and Chinese), auto-generated navigation and collections (tags, categories), RSS/Sitemap generation, and a robust CI/CD pipeline for quality assurance.

2.  **Knowledge Extraction & Graph Backend:** The project uses a combination of Python and Node.js tools to extract structured information from unstructured text, build a knowledge graph, and store it in a Neo4j database.
    *   A suite of Node.js scripts (`graphrag:*`) manages the ingestion, querying, and export of data from the Neo4j graph, integrating it into the VitePress site (e.g., for visualizations).

## Recent Developments

The project has recently seen the addition of several new articles and guides, expanding the knowledge base and providing deeper insights into the project's architecture and workflows. These include:

*   **`pagegen-retrospective`**: A look back at the evolution of the Pagegen system, detailing its transformation into a modular, concurrent, and plugin-based architecture.
*   **`telemetry-cases`**: Real-world case studies on using Telemetry and CLI logs to diagnose and resolve issues within the Pagegen and AI pipelines.
*   **`ai-placeholder-retrospective`**: An analysis of the placeholder runtime, its benefits, limitations, and best practices for transitioning to live models.
*   **`ai-runtime-guide`**: A comprehensive guide to switching between placeholder and production AI models, covering environment configuration, smoke testing, and rollback strategies.
*   **`project-overview`**: A complete overview of the Ling Atlas project, including its vision, roadmap, and current capabilities.
*   **`tutorial-authoring-to-publish`**: A step-by-step tutorial on the full content authoring and publishing workflow, from article creation to deployment and rollback.

## Technologies

*   **Frontend:** VitePress, Markdown
*   **Backend & Tooling:**
    *   Node.js: Used extensively for scripting the content generation pipeline (`pagegen`), running builds, tests, and managing the knowledge graph.
*   **AI / Machine Learning:**
    *   `@xenova/transformers.js`: For in-browser/Node.js model inference (e.g., embeddings, summarization).
    *   Google Gemini API: Used for structured data extraction (entity and relationship extraction).
    *   LangChain: Used for interacting with the LLM.
*   **Database:** Neo4j (graph database)
*   **CI/CD:** GitHub Actions
*   **Search:** Pagefind (lexical search) and semantic search capabilities via embeddings.

## Building and Running

The project is primarily managed through `npm` scripts.

### Main Website (VitePress)

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Generate Content Pages:**
    The site relies on auto-generated pages (e.g., tag lists, category indexes). These must be generated before running the dev server.
    ```bash
    npm run gen
    ```

3.  **Run Local Development Server:**
    This command will first run the `gen` script and then start the VitePress dev server.
    ```bash
    npm run dev
    ```

4.  **Build for Production:**
    This command runs the full pipeline, including AI-powered steps, content generation, and the VitePress build.
    ```bash
    npm run build
    ```

### Knowledge Graph (GraphRAG & Neo4j)

The knowledge graph workflow requires a running Neo4j instance. A `docker-compose.neo4j.yml` file is provided for convenience.

1.  **Start Neo4j:**
    ```bash
    docker-compose -f docker-compose.neo4j.yml up -d
    ```

2.  **Prepare Database:**
    Set up initial constraints and indexes in Neo4j.
    ```bash
    npm run graphrag:constraints
    ```

3.  **Ingest Content into Graph:**
    Process Markdown files and load entities/relationships into Neo4j.
    ```bash
    npm run graphrag:ingest -- --locale zh
    ```

### Knowledge Extraction from Text

The project includes a TypeScript-based knowledge extraction command-line tool.

1.  **Set Environment Variables:**
    Create a `.env` file with your `GOOGLE_API_KEY`.

2.  **Run the CLI App (`scripts/app.ts`):**
    ```bash
    cat your_text_file.txt | npm run graphrag:from-text
    ```
