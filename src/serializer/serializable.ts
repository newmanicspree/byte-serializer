import {SerializerInfo} from './serializerInfo'
import {BitOrder} from '../enums/bitOrder'
import {TextEncoding} from '../enums/textEncoding'
import {NumberType} from '../enums/numberType'
import {PropertyType} from '../enums/propertyType'
import {CommonMetadata} from '../interfaces/commonMetadata'
import {NumberMetadata} from '../interfaces/numberMetadata'
import {NestedMetadata} from '../interfaces/complexMetadata'
import {StringMetadata} from '../interfaces/stringMetadata'
import {CRC,CRCMetadata} from '../interfaces/crc'
import {Defaults} from '../interfaces/defaults'
import {} from 'node'

/**
 * Define the structure of the serializable payload and embed the main methods to transform array in to object and vice versa.
 */
export abstract class Serializable {
   

    private _serializeMetadata?:CommonMetadata[];
    private _messageMetadata?:CommonMetadata[];
    private _bufferLength?:number;

    /**
    * Return the serialization metadata for current type
    */
    public get serializeMetadata():CommonMetadata []{
        if(this._serializeMetadata)
            return this._serializeMetadata;
        let _meta = Object.getPrototypeOf(this)._metaSerialize;
        this._serializeMetadata = Object            .keys(_meta)
            .map(o => Object.assign({
                name: o
            }, _meta[o]))
            .sort((a, b) => a.position - b.position);
        return this._serializeMetadata
    }

    /**
     * Return the additional metadata for current message type configuration
     */
    public get messageMetadata():CommonMetadata [] { 
        if(this._messageMetadata)
            return this._messageMetadata;
        let _msg = Object.getPrototypeOf(this)._metaMessage;
        if(_msg)
            this._messageMetadata=  Object.keys(_msg).map(o => Object.assign({
                    name: o
            }, _msg[o]));
        else 
            this._messageMetadata = [];
        return this._messageMetadata;
    }

    /**
     * Return the length of entire buffer
     */
    public get bufferLength(): number{
        let metas = this.serializeMetadata;
        let that = <any>this;
        return metas.filter(o=>!o.ignoreSerialize).reduce(function(a,b){
            if(typeof(b.length)==="number") return a + b.length;
            else if(typeof(that[b.name].length)==="number") return a+ that[b.name].length;
            else throw "Invalid length for " + b.name + " field";
        },0);
    }

    /**
     * Return a buffer that contains all data information stored in properties of the current instance of the object
     */
    public serialize(defs?:Defaults) : Buffer {
        defs = defs || {};
        let metas = this.serializeMetadata;
        let msgs = this.messageMetadata;
        let lastMeta = metas[metas.length-1];
        let len = this.bufferLength;
        let buffer : Buffer = Buffer.allocUnsafe(len);
        for (let meta of metas) {
            if(meta.ignoreSerialize) continue;
            if (meta.propertyType === PropertyType.Number) {             
                if ((<NumberMetadata>meta).bitOrder === null || (<NumberMetadata>meta).bitOrder === undefined) {
                    (<NumberMetadata>meta).bitOrder = defs.bitOrder || BitOrder.BE;
                }

                if ((<NumberMetadata>meta).numberType === null || (<NumberMetadata>meta).numberType === undefined) {
                    (<NumberMetadata>meta).numberType = defs.numberType || NumberType.UInt8;
                }
                
                if((<NumberMetadata>meta).bitOrder === BitOrder.BE) {
                    switch ((<NumberMetadata>meta).numberType) {
                        case NumberType.Int8:buffer.writeInt8((<any>this)[meta.name],meta.position);break;
                        case NumberType.UInt8:buffer.writeUInt8((<any>this)[meta.name],meta.position);break;
                        case NumberType.Int16:buffer.writeInt16BE((<any>this)[meta.name],meta.position);break;
                        case NumberType.UInt16:buffer.writeUInt16BE((<any>this)[meta.name],meta.position);break;
                        case NumberType.Int32:buffer.writeInt32BE((<any>this)[meta.name],meta.position);break;
                        case NumberType.UInt32:buffer.writeUInt32BE((<any>this)[meta.name],meta.position);break;
                        case NumberType.Float:buffer.writeFloatBE((<any>this)[meta.name],meta.position);break;
                        case NumberType.Double:buffer.writeDoubleBE((<any>this)[meta.name],meta.position);break;                        
                        default: throw "Unknown number type.";
                    }
                } else {
                    switch ((<NumberMetadata>meta).numberType) {
                        case NumberType.Int8:buffer.writeInt8((<any>this)[meta.name],meta.position);break;
                        case NumberType.UInt8:buffer.writeUInt8((<any>this)[meta.name],meta.position);break;
                        case NumberType.Int16:buffer.writeInt16LE((<any>this)[meta.name],meta.position);break;
                        case NumberType.UInt16:buffer.writeUInt16LE((<any>this)[meta.name],meta.position);break;
                        case NumberType.Int32:buffer.writeInt32LE((<any>this)[meta.name],meta.position);break;
                        case NumberType.UInt32:buffer.writeUInt32LE((<any>this)[meta.name],meta.position);break;
                        case NumberType.Float:buffer.writeFloatLE((<any>this)[meta.name],meta.position);break;
                        case NumberType.Double:buffer.writeDoubleLE((<any>this)[meta.name],meta.position);break;
                        default: throw "Unknown number type.";
                    }
                }
            }
            if (meta.propertyType === PropertyType.String) {
                if ((<StringMetadata>meta).textEncoding === null || (<StringMetadata>meta).textEncoding === undefined) {
                    (<StringMetadata>meta).textEncoding = defs.textEncoding || TextEncoding.ASCII;
                }
                let l = 0;
                if(typeof(meta.length)==="number")
                    l = meta.length;
                else if(typeof((<any>this)[meta.name].length)==="number")
                    l = (<any>this)[meta.name].length;
                else
                    throw "Invalid length for " + meta.name + " field";
                buffer.write((<any>this)[meta.name], meta.position, l, (<StringMetadata>meta).textEncoding);
            }
            if (meta.propertyType === PropertyType.Buffer) {
                let l = 0;
                if(typeof(meta.length)==="number")
                    l = meta.length;
                else if(typeof((<any>this)[meta.name].length)==="number")
                    l = (<any>this)[meta.name].length;
                else
                    throw "Invalid length for " + meta.name + " field";
                (<Buffer>((<any>this)[meta.name])).copy(buffer, meta.position, 0, l);
            }

            if (meta.propertyType === PropertyType.Object) {
                (<Serializable>((<any>this)[meta.name])).serialize(defs).copy(buffer, meta.position, 0, meta.length);
            }

            if (meta.propertyType === PropertyType.Array) {
                if((<any>(<NestedMetadata>meta).nestedType).prototype instanceof Serializable){
                    let a = <Array<Serializable>>((<any>this)[meta.name]);
                    let stPos = meta.position;
                    let _len = (<NestedMetadata>meta).nestedSize;
                    for(let item of a){
                        item.serialize(defs).copy(buffer, stPos, 0, _len);
                        stPos += _len;
                    }
                }

                if( (<NestedMetadata>meta).nestedType === PropertyType.Number){
                    let a = <Array<Serializable|number>>((<any>this)[meta.name]);
                    let f:(value:number,offset:number,noAssert?:boolean)=>number;
                    if((<NestedMetadata>meta).nestedBitOrder === BitOrder.BE) {
                        switch ((<NestedMetadata>meta).nestedNumber) {
                            case NumberType.Int8 : f = buffer.writeInt8;break;
                            case NumberType.UInt8 : f = buffer.writeUInt8;break;
                            case NumberType.Int16 : f = buffer.writeInt16BE;break;
                            case NumberType.UInt16 : f = buffer.writeUInt16BE;break;
                            case NumberType.Int32 : f = buffer.writeInt32BE;break;
                            case NumberType.UInt32 : f = buffer.writeUInt32BE;break;
                            case NumberType.Float : f = buffer.writeFloatBE;break;
                            case NumberType.Double : f = buffer.writeDoubleBE;break;                        
                            default: throw "Unknown number type.";
                        }
                    } else {
                        switch ((<NestedMetadata>meta).nestedNumber) {
                            case NumberType.Int8: f = buffer.writeInt8;break;
                            case NumberType.UInt8: f = buffer.writeUInt8;break;
                            case NumberType.Int16: f = buffer.writeInt16LE;break;
                            case NumberType.UInt16: f = buffer.writeUInt16LE;break;
                            case NumberType.Int32: f = buffer.writeInt32LE;break;
                            case NumberType.UInt32: f = buffer.writeUInt32LE;break;
                            case NumberType.Float: f = buffer.writeFloatLE;break;
                            case NumberType.Double: f = buffer.writeDoubleLE;break;
                            default: throw "Unknown number type.";
                        }
                    }
                    let stPos = meta.position;
                    let _len = (<NestedMetadata>meta).nestedSize;
                    for(let item of a){
                        f(<number>item, _len)
                        stPos += _len;
                    }
                }
            }

            if ((<any>this)[meta.name] === undefined || (<any>this)[meta.name] === null) {
                throw "Unset variable '" + meta.name + "' is not allowed!";
            }
        }
        if(typeof((<any>this).crcInfo)!=="undefined"){
            let thisAny = <any>this;
            let l = 0;
            if(typeof(lastMeta.length)==="number")
                l = lastMeta.length;
            else if(typeof((<any>this)[lastMeta.name].length)==="number")
                l = (<any>this)[lastMeta.name].length;
            else
                throw "Invalid length for " + lastMeta.name + " field";
            var crcBuff =Buffer.from((<CRC>((<any>this)[thisAny.crcInfo.name])).compute(<Array<number>><any>buffer.slice(thisAny.crcInfo.startByte,thisAny.crcInfo.stopByte)));
            crcBuff.copy(buffer,lastMeta.position+l, 0, thisAny.crcInfo.length);
        }
        if(typeof((<any>this).endInfo)!=="undefined"){
            buffer[buffer.length-1] = (<any>this)[(<any>this).endInfo.name];
        }
        return buffer;
    }

    /**
     * Set values of properties from a buffer
     */
    public deserialize(buffer: Buffer, defs?:Defaults){
        defs = defs || {};
        let metas = this.serializeMetadata;
        let len = buffer.length;
        let end  =typeof( (<any>this).endInfo) !=="undefined" && (<any>this).endInfo.enable !== false ? (<any>this)[(<any>this).endInfo.name] : null;
        if (end !== null && typeof(end) === "number" && buffer[buffer.length-1] !== end)
           throw "unexpected end of frame"
        ////////////////////////
        let dyn = len - (typeof((<any>this).crcInfo) !== "undefined" && typeof((<any>this).crcInfo.length) === "number" ? (<any>this).crcInfo.length : 0) - (end ? 1 : 0);
        dyn -= metas.filter(o=>!o.ignoreDeserialize && typeof(o.length) ==="number").reduce((a, b)=>a+b.length, 0)
        if(typeof((<any>this).crcInfo)!=="undefined"){
            let thisAny = <any>this;
            var crcBuff =(<CRC>((<any>this)[thisAny.crcInfo.name])).compute(<Array<number>><any>buffer.slice(thisAny.crcInfo.startByte,thisAny.crcInfo.stopByte));
            let crcread= buffer.slice(len - (<CRCMetadata>thisAny.crcInfo).length - (end ? 1 : 0), len - (end ? 1 : 0));
            if(crcBuff.compare(crcread)!==0)
                throw "CRC not match";
        }
        for(let meta of metas){
            if(meta.ignoreDeserialize)
                continue;
            if (meta.propertyType === PropertyType.Number) {     
                if ((<NumberMetadata>meta).bitOrder === null || (<NumberMetadata>meta).bitOrder === undefined) {
                    (<NumberMetadata>meta).bitOrder = defs.bitOrder || BitOrder.BE;
                }

                if ((<NumberMetadata>meta).numberType === null || (<NumberMetadata>meta).numberType === undefined) {
                    (<NumberMetadata>meta).numberType = defs.numberType || NumberType.UInt8;
                }
                if((<NumberMetadata>meta).bitOrder === BitOrder.BE) {
                    switch ((<NumberMetadata>meta).numberType) {
                        case NumberType.Int8:(<any>this)[meta.name] = buffer.readInt8(meta.position);break;
                        case NumberType.UInt8:(<any>this)[meta.name] = buffer.readUInt8(meta.position);break;
                        case NumberType.Int16:(<any>this)[meta.name] = buffer.readInt16BE(meta.position);break;
                        case NumberType.UInt16:(<any>this)[meta.name] = buffer.readUInt16BE(meta.position);break;
                        case NumberType.Int32:(<any>this)[meta.name] = buffer.readInt32BE(meta.position);break;
                        case NumberType.UInt32:(<any>this)[meta.name] = buffer.readUInt32BE(meta.position);break;
                        case NumberType.Float:(<any>this)[meta.name] = buffer.readFloatBE(meta.position);break;
                        case NumberType.Double:(<any>this)[meta.name] = buffer.readDoubleBE(meta.position);break;
                        default: throw "Unknown number type.";
                    }
                } else {
                    switch ((<NumberMetadata>meta).numberType) {
                        case NumberType.Int8:(<any>this)[meta.name] = buffer.readInt8(meta.position);break;
                        case NumberType.UInt8:(<any>this)[meta.name] = buffer.readUInt8(meta.position);break;
                        case NumberType.Int16:(<any>this)[meta.name] = buffer.readInt16LE(meta.position);break;
                        case NumberType.UInt16:(<any>this)[meta.name] = buffer.readUInt16LE(meta.position);break;
                        case NumberType.Int32:(<any>this)[meta.name] = buffer.readInt32LE(meta.position);break;
                        case NumberType.UInt32:(<any>this)[meta.name] = buffer.readUInt32LE(meta.position);break;
                        case NumberType.Float:(<any>this)[meta.name] = buffer.readFloatLE(meta.position);break;
                        case NumberType.Double:(<any>this)[meta.name] = buffer.readDoubleLE(meta.position);break;
                        default: throw "Unknown number type.";
                    }
                }
            }

            if (meta.propertyType === PropertyType.String) {
                if ((<StringMetadata>meta).textEncoding === null || (<StringMetadata>meta).textEncoding === undefined) {
                    (<StringMetadata>meta).textEncoding = defs.textEncoding || TextEncoding.ASCII;
                }
                let l = typeof(meta.length) !== "undefined" ? meta.length : dyn;
                (<any>this)[meta.name] = buffer.toString((<StringMetadata>meta).textEncoding, meta.position, meta.position + l);
            }

            if (meta.propertyType === PropertyType.Buffer) {
                let l = typeof(meta.length) !== "undefined" ? meta.length : dyn;
                (<any>this)[meta.name] = Buffer.from(buffer.slice(meta.position, meta.position + l));
            }

            if (meta.propertyType === PropertyType.Object) {
                //let l = typeof(meta.length) !== "undefined" ? meta.length : dyn;
                let a = new (<ISerializable>(<NestedMetadata>meta).nestedType)();
                (<any>this)[meta.name] = a.deserialize(Buffer.from(buffer.slice(meta.position, meta.position + meta.length)),defs);
            }

            if (meta.propertyType === PropertyType.Array) {
                if((<any>(<NestedMetadata>meta).nestedType).prototype instanceof Serializable){
                    let a = new Array<Serializable>()
                    let reps = meta.length/(<NestedMetadata>meta).nestedSize;
                    let start = meta.position;
                    for(let i =0;i<reps;i++) {
                        let o = new (<ISerializable>(<NestedMetadata>meta).nestedType)();
                        o.deserialize(Buffer.from(buffer.slice(start,start+(<NestedMetadata>meta).nestedSize)),defs);
                        a.push(o);
                    }
                    (<any>this)[meta.name] = a;
                }
                if( (<NestedMetadata>meta).nestedType === PropertyType.Number){
                    let a = new Array<number>();
                    let f:(offset:number,noAssert?:boolean)=>number;
                    if((<NestedMetadata>meta).nestedBitOrder === BitOrder.BE) {
                        switch ((<NestedMetadata>meta).nestedNumber) {
                            case NumberType.Int8 : f = buffer.readInt8;break;
                            case NumberType.UInt8 : f = buffer.readUInt8;break;
                            case NumberType.Int16 : f = buffer.readInt16BE;break;
                            case NumberType.UInt16 : f = buffer.readUInt16BE;break;
                            case NumberType.Int32 : f = buffer.readInt32BE;break;
                            case NumberType.UInt32 : f = buffer.readUInt32BE;break;
                            case NumberType.Float : f = buffer.readFloatBE;break;
                            case NumberType.Double : f = buffer.readDoubleBE;break;                        
                            default: throw "Unknown number type.";
                        }
                    } else {
                        switch ((<NestedMetadata>meta).nestedNumber) {
                            case NumberType.Int8: f = buffer.readInt8;break;
                            case NumberType.UInt8: f = buffer.readUInt8;break;
                            case NumberType.Int16: f = buffer.readInt16LE;break;
                            case NumberType.UInt16: f = buffer.readUInt16LE;break;
                            case NumberType.Int32: f = buffer.readInt32LE;break;
                            case NumberType.UInt32: f = buffer.readUInt32LE;break;
                            case NumberType.Float: f = buffer.readFloatLE;break;
                            case NumberType.Double: f = buffer.readDoubleLE;break;
                            default: throw "Unknown number type.";
                        }
                    }
                    let reps = meta.length/(<NestedMetadata>meta).nestedSize;
                    let start = meta.position;
                    for(let i =0;i<reps;i++) {
                        a.push(f.call(buffer, start));
                        start += (<NestedMetadata>meta).nestedSize
                    }
                    (<any>this)[meta.name] = a;
                }
            }
        }
    }
}

export interface ISerializable {
    new () : Serializable;
    prototype:any
}