import { defineComponent, h } from "vue";
import { createElementVNode as _createElementVNode, openBlock as _openBlock, createElementBlock as _createElementBlock } from "vue"

const _hoisted_1 = { class: "flex flex-col gap-4" }

export function render(_ctx: any, _cache: any, $props: any, $setup: any, $data: any, $options: any) {
  return (_openBlock(), _createElementBlock("div", _hoisted_1, [...(_cache[0] || (_cache[0] = [
    _createElementVNode("h2", null, "This is a compiled Vue component.", -1 /* CACHED */),
    _createElementVNode("h3", null, "Icon name: ${props.icon}", -1 /* CACHED */)
  ]))]))
}

const component = defineComponent({
  name: "CompiledComponent",    
  props: {
    icon: { type: String, required: true },
  },
  setup(props) {
    // return () =>
    //   h("div", { class: "flex flex-col gap-4" }, [
    //     h("h2", "This is a compiled Vue component."),
    //     h("h3", `Icon name: ${props.icon}`),
    //   ]);
  },  
  render: render

});


export default component; 