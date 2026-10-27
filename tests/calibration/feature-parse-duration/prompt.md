给 src/duration.js 加一个 parseDuration(text)，做 formatDuration 的逆运算：把 "1h 30m"、"45s"、"2h 5s"、"250ms" 这样的文本解析成毫秒数。

要求：

- 单位与 formatDuration 相同：h、m、s、ms。每一段是非负整数紧跟单位，段与段之间用一个或多个空格分隔。
- 每个单位最多出现一次，并且按从大到小的顺序排列；"0ms" 解析为 0。
- 不合法的输入（空串、未知单位、小数、负数、段之间没有空格、顺序不对、单位重复、不是字符串）和 formatDuration 一样抛出 TypeError。
- formatDuration 输出的任何字符串，parseDuration 都要还原成原来的毫秒数。
- 补上测试，并在 README 的 API 一节写上说明。
- 完成后运行 npm test，确认全部通过。
