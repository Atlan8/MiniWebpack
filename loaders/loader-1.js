// loader本质上就是一个函数，接受原始内容，返回转换后的内容
function loader1(sourceCode) {
  console.log("join loader1");
  return sourceCode + `\n  const loader1 = "https://github.com/Atlan8"`;
}

module.exports = loader1;
