import { parse, compileScript, compileStyle, compileTemplate } from '@vue/compiler-sfc';
import type * as sfc from '@vue/compiler-sfc';
import { rm } from 'fs/promises';
import path from 'path';

let input: string;
let parsed: sfc.SFCParseResult;





export interface CompileOptions {
    inputFilePath: string;
    outputFilePath: string;
}

const vueComponentDir = `${import.meta.dir}`;
const distDir = path.join(vueComponentDir, 'dist');




const compileComponent = async (opts: CompileOptions = { inputFilePath: path.join(vueComponentDir, 'icon.vue'), outputFilePath: path.join(distDir, 'icon.ts') }) => {

    

    try {
        await rm(distDir, { recursive: true, force: true });
    } catch { }


    try {
        input = await Bun.file(opts.inputFilePath).text();
    } catch (e) {
        console.error("Error reading file:", e);
        process.exit(1);
    }

    if (!input) {
        console.error("No content in input file.");
        process.exit(1);
    }
    try {
        parsed = parse(input);
        if (parsed.errors.length) {
            console.error("Errors parsing SFC:", parsed.errors);
            process.exit(1);
        }

    } catch (e) {
        console.error("Error parsing SFC:", e);
        process.exit(1);
    }
    const descriptor = parsed.descriptor;

    const componentName = descriptor.filename?.replace('.vue', '') || '';



    const scriptOpts: sfc.SFCScriptCompileOptions = {
        id: descriptor.filename?.replace('.vue', '').toLowerCase() || 'component',
        isProd: true,
        inlineTemplate: true,
        genDefaultAs: 'component',
        templateOptions: {
            ssr: true,
            compilerOptions: {
                cacheHandlers: true,
                comments: false,
                isTS: true,
                hoistStatic: true,
                inline: true,                
                bindingMetadata: descriptor.script?.bindings,
            },
            
            source: descriptor?.template?.content || '',
            filename: descriptor.filename || 'component',
            id: descriptor.filename.replace('.vue', '').toLowerCase() || 'component',
            ast: descriptor.template?.ast,           
        },
        
        hoistStatic: true,
    
        babelParserPlugins: ['typescript'],
    
    }


    const script = compileScript(descriptor, scriptOpts);

    if (process.argv.includes('-v')) {

        console.log('-----------------------');
        console.log("Compiled script content:\n", script.content);
        console.log('-----------------------');
    };

    const templateOpts: sfc.SFCTemplateCompileOptions = {
        ssr: true,
        compilerOptions: {
            cacheHandlers: true,
            comments: false,
            isTS: true,
            hoistStatic: true,
            inline: true,
            parseMode: 'sfc',
            mode: 'module',
            bindingMetadata: descriptor.script?.bindings,
        },
    
        source: descriptor?.template?.content || '',
        filename: descriptor.filename || 'component',
        id: descriptor.filename.replace('.vue', '').toLowerCase() || 'render',
        ast: descriptor.template?.ast
        

    };

    const ssrRender = compileTemplate(templateOpts);
    const render = compileTemplate({ ...templateOpts, ssr: false });



    const style = descriptor.styles.map((s) => compileStyle({ source: s.content, filename: descriptor.filename || 'component', id: 'component' }));
    const cssVars = descriptor.cssVars;
    
    if (process.argv.includes('-v')) {
        console.log('-----------------------');
        console.log("Compiled script:\n", script.content);
        console.log('-----------------------');
        console.log("Compiled SSR template:\n", ssrRender.code);
        console.log('-----------------------');
        console.log("Compiled CSR template:\n", render.code);
        console.log('-----------------------');
        console.log("Compiled styles:\n", style.map((s) => s.code));
        console.log('-----------------------');
        console.log("CSS Vars:", cssVars);
        console.log('-----------------------');

    };
    

    const component = `
${render.preamble }
    ${script.content }

component.render = ${render.code };
component.ssrRender = ${ssrRender.code };

component.name = ${JSON.stringify(componentName) };

export default component;

`;





    const trans = new Bun.Transpiler({
        target: "node", 
        deadCodeElimination: false, 
        autoImportJSX: false, 
        loader: "ts", 
        logLevel: 'verbose', 
        trimUnusedImports: true,
        inline: true,
        minifyWhitespace: true,
    });
    try {
        const res = await trans.transform(component);
        if (!res) throw new Error("No transpilation result.");
        return res;
    } catch (e) {
        console.error("Error during transpilation or writing file:", e);
        process.exit(1);
    }
};


const main = async () => {
    const res = await compileComponent({
        inputFilePath: path.join(vueComponentDir, 'icon.vue'),
        outputFilePath: path.join(distDir, 'icon.ts')
    });

    try {
        await Bun.write(path.join(distDir), res || "");
        console.log("Component compiled successfully to ./dist/icon.ts");
    } catch (e) {
        console.error("Error writing output file:", e);
        process.exit(1);
    }
};

if (import.meta.main) {
    await main();
}

export default compileComponent; 