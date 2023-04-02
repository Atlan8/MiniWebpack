const { readFileSync } = require("fs");
const { SyncHook } = require("tapable");
const { toUnixPath, tryExtensions } = require("./utils");
const parser = require("@babel/parser");
const traverse = require("@babel/traverse").default;
const generator = require("@babel/generator").default;
const t = require("@babel/types");
const path = require("path");

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
    // 编译入口文件
    this.buildEntryModule(entry);
  }

  /**
   * 获取入口文件路径
   * @returns
   */
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

  /**
   * 入口模块编译方法
   * 循环入口对象，得到每一个入口对象的名称和路径
   * @param {*} entry
   */
  buildEntryModule(entry) {
    Object.keys(entry).forEach((entryName) => {
      const entryPath = entry[entryName];
      const entryObj = this.buildModule(entryName, entryPath);
      this.entries.add(entryObj);
      // 根据当前入口文件和模块的相互依赖关系，组装一个包含当前入口所有依赖模块的chunk
      this.buildUpChunk(entryName, entryObj);
    });
    // console.log(this.entries, "entries");
    // console.log(this.modules, "modules");
    console.log(this.chunks, "chunks");
  }

  /**
   * 模块编译方法
   * @param {*} moduleName
   * @param {*} modulePath
   * @returns 编译入口文件之后的对象
   */
  buildModule(moduleName, modulePath) {
    // 1. 读取文件原始代码
    const originSourceCode = (this.originSourceCode = readFileSync(modulePath, "utf-8"));
    this.moduleCode = originSourceCode;
    // 2. 调用loader进行处理
    this.handleLoader(modulePath);
    // 3. 调用webpack进行模块编译 获得最终的module对象
    const module = this.handleWebpackCompiler(moduleName, modulePath);
    // 4. 返回对应module
    return module;
  }

  /**
   * 匹配loader处理
   * @param {*} modulePath
   */
  handleLoader(modulePath) {
    const matchLoaders = [];
    // 1. 获取所有传入的loader规则
    const rules = this.options.module.rules;
    rules.forEach((loader) => {
      const testRule = loader.test;
      if (testRule.test(modulePath)) {
        if (loader.loader) {
          // 仅考虑loader { test:/\.js$/g, use:['babel-loader'] }, { test:/\.js$/, loader:'babel-loader' }
          matchLoaders.push(loader.loader);
        } else {
          matchLoaders.push(...loader.use);
        }
      }
      // 2. 倒序执行loader传入源代码
      for (let i = matchLoaders.length - 1; i >= 0; i--) {
        /**
         * 目前我们仅支持传入绝对路径的loader模式
         * require
         */
        const loaderFn = require(matchLoaders[i]);
        //
        this.moduleCode = loaderFn(this.moduleCode);
      }
    });
  }

  /**
   * 调用webpack进行模块编译
   * @param {*} moduleName
   * @param {*} modulePath
   */
  handleWebpackCompiler(moduleName, modulePath) {
    const _this = this;
    // 将当前模块相对于项目启动根目录计算出相对路径，作为模块id
    const moduleId = `./${path.posix.relative(this.rootPath, modulePath)}`;
    // 创建模块对象
    const module = {
      id: moduleId,
      dependencies: new Set(), // 该模块所依赖的模块绝对路径地址
      name: [moduleName], // 该模块所属的入口文件
    };
    // 调用babel分析我们的代码
    const ast = parser.parse(this.moduleCode, {
      sourceType: "module",
    });
    // 深度优先 遍历语法树
    traverse(ast, {
      // 当遇到require语句时
      CallExpression: (nodePath) => {
        const node = nodePath.node;
        if (node.callee.name === "require") {
          // 获得源代码中引入的模块相对路径
          const requirePath = node.arguments[0].value;
          // 寻找模块绝对路径 当前模块路径+require()相对路径
          const moduleDirName = path.posix.dirname(modulePath);
          const absolutePath = tryExtensions(path.posix.join(moduleDirName, requirePath), _this.options.resolve.extensions, requirePath, moduleDirName);
          // 生成moduleId - 针对根路径的模块id 添加进入新的依赖模块路径
          const moduleId = `./${path.posix.relative(_this.rootPath, absolutePath)}`;
          // 通过babel修改源代码中的require变成__webpack_require__语句
          node.callee = t.identifier("__webpack_require__");
          // 修改源代码中require语句引入的模块 全部修改为相对路径来处理
          node.arguments = [t.stringLiteral(moduleId)];
          //
          const alreadyModules = Array.from(_this.modules).map((i) => i.id);
          if (!alreadyModules.includes(moduleId)) {
            // 为当前模块添加require语句造成的依赖（内容为相对于根路径的模块id）
            module.dependencies.add(moduleId);
          } else {
            //
            this.modules.forEach((value) => {
              if (value.id === moduleId) {
                value.name.push(moduleName);
              }
            });
          }
        }
      },
    });
    // 遍历结束根据AST生成新的代码
    const { code } = generator(ast);
    // 为当前模块挂载新生成的代码
    module._source = code;
    // 递归深度遍历依赖，存在依赖则添加到this.modules
    module.dependencies.forEach((dependency) => {
      const depModule = _this.buildModule(moduleName, dependency);
      // 将编译后的所有依赖模块对象添加到modules对象中
      this.modules.add(depModule);
    });
    // 返回当前模块对象
    return module;
  }

  /**
   * 根据入口文件和依赖模块组装chunk
   * @param {*} entryName
   * @param {*} entryObj
   */
  buildUpChunk(entryName, entryObj) {
    const chunk = {
      name: entryName, // 每一个入口文件作为一个chunk
      entryModule: entryObj, // entry编译后的对象
      modules: Array.from(this.modules).filter((i) => i.name.includes(entryName)), // 寻找所有与当前entry相关的module
    };
    // 将chunk添加到this.chunks中去
    this.chunks.add(chunk);
  }
}

module.exports = Compiler;
