export interface JvmFieldSymbol {
  name: string;
  descriptor: string;
  type: string;
  signature?: string;
  accessFlags: number;
  static: boolean;
  final: boolean;
}

export interface JvmMethodSymbol {
  name: string;
  descriptor: string;
  parameterTypes: string[];
  returnType: string;
  signature?: string;
  accessFlags: number;
  static: boolean;
  abstract: boolean;
  constructor: boolean;
}

export interface JvmClassSymbol {
  name: string;
  qualifiedName: string;
  accessFlags: number;
  superclass?: string;
  interfaces: string[];
  fields: JvmFieldSymbol[];
  methods: JvmMethodSymbol[];
  constructors: JvmMethodSymbol[];
}