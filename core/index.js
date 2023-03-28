const webpack = require("./webpack");
const config = require("../example/webpack.config");

// 步骤一：初始化参数 根据配置文件和shell参数合成参数
const compiler = webpack(config);

compiler.run((err, stats) => {
  // ...
  compiler.close((closeErr) => {
    // ...
  });
});
