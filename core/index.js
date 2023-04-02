const webpack = require("./webpack");
// const webpack = require("webpack");
const config = require("../example/webpack.config");

/**
 * 步骤一：初始化参数 根据配置文件和shell参数合成参数
 * 步骤二：调用webpack(options) 初始化compiler对象
 * webpack() 方法会返回一个compiler对象
 */
const compiler = webpack(config);

compiler.run((err, stats) => {
  if (err) {
    console.error(err, "err");
  }
  // ...
  compiler.close((closeErr) => {
    // ...
  });
});
