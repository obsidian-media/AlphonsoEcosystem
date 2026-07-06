// Restore global JSX namespace removed in @types/react v19.
// Components can use ): JSX.Element without importing it from 'react'.
import type React from 'react';

declare global {
  namespace JSX {
    type Element = React.JSX.Element;
    type ElementClass = React.JSX.ElementClass;
    type IntrinsicElements = React.JSX.IntrinsicElements;
    type IntrinsicAttributes = React.JSX.IntrinsicAttributes;
    type ElementAttributesProperty = React.JSX.ElementAttributesProperty;
    type ElementChildrenAttribute = React.JSX.ElementChildrenAttribute;
  }

  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}
