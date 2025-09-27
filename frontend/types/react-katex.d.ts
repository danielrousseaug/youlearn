declare module 'react-katex' {
  import { ReactNode } from 'react';

  interface MathProps {
    math: string;
    errorColor?: string;
    renderError?: (error: Error | TypeError) => ReactNode;
    settings?: any;
  }

  export const InlineMath: React.FC<MathProps>;
  export const BlockMath: React.FC<MathProps>;
}