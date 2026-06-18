declare module '@wlearn/xlearn' {
  export interface XLearnSparseMatrix {
    rows: number;
    cols: number;
    data: Float64Array;
    indices: Int32Array;
    indptr: Int32Array;
  }

  export interface XLearnFMParams {
    task?: 'classification' | 'regression';
    epoch?: number;
    k?: number;
    lr?: number;
    lambda?: number;
    opt?: 'adagrad' | 'ftrl' | 'sgd' | string;
    normalize?: boolean;
    alpha?: number;
    beta?: number;
    lambda_1?: number;
    lambda_2?: number;
  }

  export interface XLearnFMInstance {
    fit(X: number[][] | XLearnSparseMatrix, y: ArrayLike<number>): XLearnFMInstance;
    predict(X: number[][] | XLearnSparseMatrix): Float64Array;
    predictProba(X: number[][] | XLearnSparseMatrix): Float64Array;
    save(): Uint8Array;
    dispose(): void;
  }

  export interface XLearnFMConstructor {
    create(params?: XLearnFMParams): Promise<XLearnFMInstance>;
    load(bytes: Uint8Array): Promise<XLearnFMInstance>;
  }

  export const XLearnFM: XLearnFMConstructor;

  const xlearn: {
    XLearnFM: XLearnFMConstructor;
  };

  export default xlearn;
}
