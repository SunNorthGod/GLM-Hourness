有用户报告 redirect-scan 把不写文件的命令当成了写文件：
redirectTargets('node -e "const id = x => x; console.log(id(1))"') 应该返回 []，实际返回的是 ['x']。
请找到原因并修复，补一个能复现这个问题的测试，确认 npm test 全部通过。其他行为按 README 的约定，保持不变。
