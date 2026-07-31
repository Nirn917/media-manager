<script setup lang="ts">
import { Primitive } from 'radix-vue'
import { buttonVariants, type ButtonVariants } from '.'
import { cn } from '~/lib/utils'

const props = withDefaults(defineProps<{
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
  as?: string
  class?: string
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}>(), { as: 'button', type: 'button' })
</script>

<template>
  <Primitive :as="as" :as-child="false" :class="cn(buttonVariants({ variant, size }), props.class)" :disabled="disabled" :type="as === 'button' ? type : undefined">
    <slot />
  </Primitive>
</template>