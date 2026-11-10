这是一个核验任务。项目的项目图 docs/graph/nodes/ 里有一个 id 为 reuse-check 的节点，README 说明了背景。请按顺序完成三步，全部完成后回复 done：

1. 用 graph_comment 工具给节点 reuse-check 写一条批注，正文一行，说明本次会话在核验延迟加载的图工具能否复用。
2. 用 memory_store 存一条记忆：name 用 graph-comment-check，type 用 project，scope 用 project，description 与 body 各写一句本次做了什么。
3. 用 memory_query 按名字 graph-comment-check 读回这条记忆，确认能查到。

不要修改其他文件，不要动 docs/graph 里 reuse-check 以外的节点。
