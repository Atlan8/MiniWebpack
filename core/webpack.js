import { Compiler } from "./compiler";

function webpack(options) {
  // 合并参数 得到合并后的参数 mergeOptions
  const mergeOptions = _mergeOptions(options);
  // 创建Compiler对象
  const compiler = new Compiler(mergeOptions);

  return compiler;
}

// 合并参数
function _mergeOptions(options) {
  const shellOptions = process.argv.slice(2).reduce((option, argv) => {
    // argv -> --mode=production
    const [key, value] = argv.slice("=");
    if (key && value) {
      const parseKey = key.slice(2);
      option[parseKey] = value;
    }
    return option;
  }, {});
  return { ...options, ...shellOptions };
}

module.exports = webpack;
