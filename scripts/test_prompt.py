from app import build_prompt
text = "这一段只有一个实体：GraphRAG 是由微软提出的。"
print(build_prompt(text))
