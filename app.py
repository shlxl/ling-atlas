import argparse
import json
import os
import random
import re
import sys
import time
import unicodedata
from typing import Dict, List, Optional

from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

load_dotenv()

API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
DEFAULT_MODEL = os.getenv("GEMINI_DEFAULT_MODEL", "gemini-1.5-pro")
MAX_GRAPH_NODES = int(os.getenv("GEMINI_MAX_GRAPH_NODES", "50"))
MAX_GRAPH_RELATIONSHIPS = int(os.getenv("GEMINI_MAX_GRAPH_RELATIONSHIPS", "100"))


def _patch_google_client() -> None:
    try:
        from google.ai.generativelanguage_v1beta.services.generative_service.client import (
            GenerativeServiceClient,
        )
        from google.ai.generativelanguage_v1beta.services.generative_service.async_client import (
            GenerativeServiceAsyncClient,
        )
    except Exception:
        return

    def _wrap(original):
        def patched(self, request=None, *, retry=None, timeout=None, metadata=(), **kwargs):
            kwargs.pop("max_retries", None)
            return original(self, request=request, retry=retry, timeout=timeout, metadata=metadata, **kwargs)

        return patched

    if "max_retries" not in GenerativeServiceClient.generate_content.__code__.co_varnames:
        GenerativeServiceClient.generate_content = _wrap(GenerativeServiceClient.generate_content)
    if "max_retries" not in GenerativeServiceAsyncClient.generate_content.__code__.co_varnames:
        GenerativeServiceAsyncClient.generate_content = _wrap(
            GenerativeServiceAsyncClient.generate_content
        )


_patch_google_client()


class Node(BaseModel):
    id: str = Field(...)
    type: str = Field("Concept")
    properties: Optional[dict] = Field(default=None)


class Relationship(BaseModel):
    source: Node
    target: Node
    type: str = Field("RELATED")
    properties: Optional[dict] = Field(default=None)


class KnowledgeGraph(BaseModel):
    nodes: List[Node]
    relationships: List[Relationship]
    doc_entity_roots: List[Dict[str, str]] = Field(default_factory=list)


PROMPT = """从以下文本中提取知识图谱。请识别出所有的实体作为节点，以及它们之间的关系。
确保节点具有唯一的ID（通常是实体的名称）和类型（例如：人、地点、组织、概念）。
如果实体或关系有额外的属性（例如日期、数量、职位、事件描述等），请将它们提取到'properties'字段中。
特别地，如果关系是双向的（例如“合作”“同事”“配偶”），请为每个方向都生成一条关系边（例如 A-合作->B 和 B-合作->A）。
文本: {text}
"""


STRUCTURE_KEYWORDS = {
    "chunk",
    "section",
    "paragraph",
    "chapter",
    "part",
    "page",
    "step",
    "item",
    "lesson",
    "segment",
}
STRUCTURE_PATTERN_EN = re.compile(
    r"^(?:chunk|section|paragraph|chapter|part|page|step|item|lesson|segment)[\s\-_#]*(?:\d+|[ivxlcdm]+)$",
    re.IGNORECASE,
)
STRUCTURE_PATTERN_CN = re.compile(r"第\s*[零一二三四五六七八九十百千\d]+(?:章节|部分|篇|节|段|章)$")


def normalize_entity_key(value: str) -> str:
    text = unicodedata.normalize("NFKC", value)
    text = re.sub(r"（.*?）|\(.*?\)|【.*?】|\[.*?\]|<.*?>|\{.*?\}", "", text)
    text = re.sub(r"[^0-9a-zA-Z\u4e00-\u9fa5]+", "", text.lower())
    return text.strip()


def get_llm(model_name: str) -> ChatGoogleGenerativeAI:
    return ChatGoogleGenerativeAI(
        model=model_name,
        temperature=0,
        google_api_key=API_KEY,
    )


def sanitize_graph(graph: KnowledgeGraph) -> KnowledgeGraph:
    nodes: List[Node] = []
    alias_map: Dict[str, str] = {}
    canonical_by_key: Dict[str, Node] = {}
    canonical_by_id: Dict[str, Node] = {}

    for node in graph.nodes:
        node_id = node.id.strip()
        node_id_lower = node_id.lower()
        if not node_id:
            continue
        if '#' in node_id or '/' in node_id:
            continue
        node_type = node.type.strip() if node.type else "Concept"
        node_type_lower = node_type.lower()
        if (
            STRUCTURE_PATTERN_EN.match(node_id)
            or STRUCTURE_PATTERN_CN.match(node_id)
            or any(node_id_lower.startswith(keyword) for keyword in STRUCTURE_KEYWORDS)
            or node_type_lower in STRUCTURE_KEYWORDS
        ):
            continue
        normalized_key = normalize_entity_key(node_id)
        if not normalized_key:
            continue

        existing = canonical_by_key.get(normalized_key)
        if existing:
            alias_map[node_id] = existing.id
            existing.type = select_type(existing.type, node_type)
            continue

        canonical_node = Node(id=node_id, type=node_type or "Concept", properties=node.properties)
        canonical_by_key[normalized_key] = canonical_node
        canonical_by_id[canonical_node.id] = canonical_node
        alias_map[node_id] = canonical_node.id
        nodes.append(canonical_node)

        if len(nodes) >= MAX_GRAPH_NODES:
            break

    canonical_ids = {node.id for node in nodes}
    relationships: List[Relationship] = []

    for rel in graph.relationships:
        source_id = alias_map.get(rel.source.id, rel.source.id)
        target_id = alias_map.get(rel.target.id, rel.target.id)
        if source_id not in canonical_ids or target_id not in canonical_ids:
            continue
        rel_type = rel.type.strip() if rel.type else "RELATED"
        source_node = canonical_by_id.get(source_id)
        target_node = canonical_by_id.get(target_id)
        relationships.append(
            Relationship(
                source=Node(
                    id=source_id,
                    type=(source_node.type if source_node else rel.source.type or "Concept"),
                    properties=rel.source.properties,
                ),
                target=Node(
                    id=target_id,
                    type=(target_node.type if target_node else rel.target.type or "Concept"),
                    properties=rel.target.properties,
                ),
                type=rel_type,
                properties=rel.properties,
            )
        )
        if len(relationships) >= MAX_GRAPH_RELATIONSHIPS:
            break

    doc_entity_roots = [
        {"name": node.id, "type": node.type or "Concept", "key": key}
        for key, node in canonical_by_key.items()
    ]
    return KnowledgeGraph(nodes=nodes, relationships=relationships, doc_entity_roots=doc_entity_roots)


def generate_graph_from_text(text: str, model_name: str) -> KnowledgeGraph:
    llm = get_llm(model_name)
    structured_llm = llm.with_structured_output(KnowledgeGraph)
    graph = structured_llm.invoke(PROMPT.format(text=text))
    return sanitize_graph(graph)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate knowledge graph using Gemini via LangChain")
    parser.add_argument("positional_model", nargs="?", default=None)
    parser.add_argument("--model", dest="model", help="Override model name")
    return parser.parse_args()


def main() -> None:
    if not API_KEY:
        print(json.dumps({"error": "未找到 GEMINI_API_KEY 或 GOOGLE_API_KEY。"}), file=sys.stderr)
        sys.exit(1)

    args = parse_args()
    model_name = args.model or args.positional_model or DEFAULT_MODEL

    text = sys.stdin.read()
    if not text.strip():
        print(json.dumps({"error": "没有从标准输入接收到文本。"}), file=sys.stderr)
        sys.exit(1)

    retries = 5
    base_delay = 2.0
    for attempt in range(retries):
        try:
            graph = generate_graph_from_text(text, model_name)
            print(graph.model_dump_json())
            return
        except Exception as error:  # pragma: no cover
            if "速率" in str(error) and attempt < retries - 1:
                delay = base_delay * (2**attempt) + random.uniform(0, 1)
                time.sleep(delay)
                continue
            print(json.dumps({"error": f"生成图谱时发生错误: {error}"}), file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
TYPE_PRIORITY = {
    "人": 100,
    "人物": 100,
    "组织": 90,
    "机构": 90,
    "公司": 90,
    "事件": 80,
    "技术": 70,
    "研究方向": 70,
    "概念": 60,
    "概念概念": 60,
    "产品": 60,
    "工具": 60,
    "领域": 60,
    "framework": 50,
    "language": 50,
}
DEFAULT_TYPE_PRIORITY = 10


def select_type(current: str, candidate: str) -> str:
    current = current or "Concept"
    candidate = candidate or "Concept"
    current_score = TYPE_PRIORITY.get(current.lower(), DEFAULT_TYPE_PRIORITY)
    candidate_score = TYPE_PRIORITY.get(candidate.lower(), DEFAULT_TYPE_PRIORITY)
    if candidate_score > current_score:
        return candidate
    return current
