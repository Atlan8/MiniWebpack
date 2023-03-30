import { SyncHook } from "tapable";
const { toUnixPath } = require("./utils");

class Compiler {
  constructor(options) {
    this.options = options;
    // 相对路径以及路径 context 参数
    this.rootPath = this.options.context || toUnixPath(process.cwd());
    // 创建plugin hooks
    this.hooks = {
      // 开始编译时的钩子
      run: new SyncHook(),
      // 输出asset到output目录之前执行（写入文件之前）
      emit: new SyncHook(),
      // 在compiler 完成时执行 全部完成编译执行
      done: new SyncHook(),
    };
    // 保存所有的入口模块对象
    this.entries = new Set();
    // 保存所有的依赖模块对象
    this.modules = new Set();
    // 保存所有的代码块对象
    this.chunks = new Set();
    // 存放本次产出的所有文件对象
    this.assets = new Set();
    // 存放本次编译所有产出的文件名
    this.files = new Set();
  }

  // run方法启动编译
  // 同时run方法接受外部传递的callback
  run(callback) {
    // 调用run方法时，触发开始编译的plugin
    this.hooks.run.call();
    // 获取入口配置对象
    const entry = this.getEntry();
  }

  // 获取入口文件路径
  getEntry() {
    let entry = Object.create(null);
    const { entry: optionsEntry } = this.options;
    if (typeof optionsEntry === "string") {
      entry["main"] = optionsEntry;
    } else {
      entry = optionsEntry;
    }

    // 将entry变成绝对路径
    Object.keys(entry).forEach((key) => {
      const value = entry[key];
      if (!path.isAbsolute(value)) {
        // 转化为绝对路径的同时，将分隔符转换成 /
        entry[key] = toUnixPath(path.join(this.rootPath, value));
      }
    });
    return entry;
  }
}

module.exports = Compiler;
