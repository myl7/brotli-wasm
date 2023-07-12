import { TextEncoder, TextDecoder } from 'text-encoding';

if (typeof global !== 'undefined' && typeof global.TextEncoder === 'undefined') {
    global.TextEncoder = TextEncoder;
    global.TextDecoder = TextDecoder;
}

let getRandomValues: typeof crypto.getRandomValues;
let btoa: typeof global.btoa;
let atob: typeof global.atob;

if (typeof process !== 'undefined' && process.versions.node) {
    // Polyfill for web APIs not present in some node versions:
    atob = global.atob || require('atob');
    btoa = global.btoa || require('btoa');

    // This is actually available as crypto.webcrypto in Node 15+, but not in older versions.
    const { Crypto } = require('@peculiar/webcrypto');
    const crypto = new Crypto();
    getRandomValues = crypto.getRandomValues.bind(crypto);
} else {
    getRandomValues = crypto.getRandomValues.bind(crypto);
    btoa = globalThis.btoa;
    atob = globalThis.atob;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const dataToBase64 = (data: Uint8Array | number[]) => btoa(String.fromCharCode(...data));
const base64ToData = (base64: string) => new Uint8Array(
    [...atob(base64)].map(c => c.charCodeAt(0))
);

import { expect } from 'chai';
import brotliPromise, { type BrotliWasmType } from '..';

describe("Brotli-wasm", () => {

    let brotli: BrotliWasmType;
    beforeEach(async () => {
        brotli = await brotliPromise;
    });

    it("can compress data", () => {
        const input = textEncoder.encode("Test input data");
        const result = brotli.compress(input);
        expect(dataToBase64(result)).to.equal('Gw4A+KWpyubolCCjVAjmxJ4D');
    });

    it("can compress data with a different quality setting", () => {
        const input = textEncoder.encode("Test input data");
        const result = brotli.compress(input, { quality: 1 });
        expect(dataToBase64(result)).to.equal('CweAVGVzdCBpbnB1dCBkYXRhAw==');
    });

    it("can decompress data", () => {
        // Generated with: echo -n '$CONTENT' | brotli --stdout - | base64
        const input = base64ToData('GxoAABypU587dC0k9ianQOgqjS32iUTcCA==');
        const result = brotli.decompress(input);
        expect(textDecoder.decode(result)).to.equal('Brotli brotli brotli brotli');
    });

    it("can compress and decompress data many times", function () {
        this.timeout(10000); // Should only take 2-4 seconds, but leave some slack

        const input = textEncoder.encode("Test input data");

        for (let i = 0; i < 500; i++) {
            const compressed = brotli.compress(input);
            expect(dataToBase64(compressed)).to.equal('Gw4A+KWpyubolCCjVAjmxJ4D');

            const decompressed = brotli.decompress(compressed);
            expect(textDecoder.decode(decompressed)).to.equal('Test input data');
        }
    });

    it("cleanly fails when options is something other than an object", () => {
        const input = textEncoder.encode("Test input data");
        expect(() =>
            brotli.compress(input, "this should not be a string" as any)
        ).to.throw('Options is not an object');
    });

    it("does not fail when options contain unknown properties", () => {
        const input = textEncoder.encode("Test input data");
        const result = brotli.compress(input, { someRandomKey: 1, quality: 5 } as any);
        expect(dataToBase64(result)).to.equal('CweAVGVzdCBpbnB1dCBkYXRhAw==');
    });

    it("does not fail when compressing with an illegal quality value", () => {
        const input = textEncoder.encode("Test input data");
        const result = brotli.compress(input, { quality: 12 });
        expect(dataToBase64(result)).to.equal('Gw4A+KWpyubolCCjVAjmxJ4D');
    });

    it("cleanly fails when decompressing garbage", () => {
        const input = textEncoder.encode("This is not brotli data, it's just a string");
        expect(() =>
            brotli.decompress(input)
        ).to.throw('Brotli decompress failed');
    });

    it("can compress & decompress back to the original result", () => {
        const input = "Some thrilling text I urgently need to compress";
        const result = textDecoder.decode(
            brotli.decompress(brotli.compress(textEncoder.encode(input)))
        );
        expect(result).to.equal(input);
    });

    it("can compress & decompress back to the original result with a different quality setting", () => {
        const input = "Some thrilling text I urgently need to compress";
        const result = textDecoder.decode(
            brotli.decompress(brotli.compress(textEncoder.encode(input), { quality: 3 }))
        );
        expect(result).to.equal(input);
    });

    it("can streamingly compress data", () => {
        const input = textEncoder.encode("Test input data");
        const input1 = input.slice(0, input.length / 2);
        const input2 = input.slice(input.length / 2);
        const stream = new brotli.CompressStream();
        const result1 = stream.compress(input1, 100);
        const output1 = result1.buf;
        expect(result1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const result2 = stream.compress(input2, 100);
        const output2 = result2.buf;
        expect(result2.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const result3 = stream.compress(undefined, 100);
        const output3 = result3.buf;
        expect(result3.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        expect(dataToBase64([...output1, ...output2, ...output3])).to.equal('Gw4A+KWpyubolCCjVAjmxJ4D');
    });

    it("can streamingly compress data with a different quality setting", () => {
        const input = textEncoder.encode("Test input data");
        const input1 = input.slice(0, input.length / 2);
        const input2 = input.slice(input.length / 2);
        const quality = 1;
        const stream = new brotli.CompressStream(quality);
        const result1 = stream.compress(input1, 100);
        const output1 = result1.buf;
        expect(result1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const result2 = stream.compress(input2, 100);
        const output2 = result2.buf;
        expect(result2.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const result3 = stream.compress(undefined, 100);
        const output3 = result3.buf;
        expect(result3.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        // It will be different from non-streaming result.
        // But it can still be decompressed back to the original string.
        let output = new Uint8Array([...output1, ...output2, ...output3]);
        expect(dataToBase64(brotli.decompress(output))).to.equal(dataToBase64(input));
    });

    it("can streamingly decompress data", () => {
        // Generated with: echo -n '$CONTENT' | brotli --stdout - | base64
        const input = base64ToData('GxoAABypU587dC0k9ianQOgqjS32iUTcCA==');
        const input1 = input.slice(0, input.length / 2);
        const input2 = input.slice(input.length / 2);
        const stream = new brotli.DecompressStream();
        const result1 = stream.decompress(input1, 100);
        const output1 = result1.buf;
        expect(result1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const result2 = stream.decompress(input2, 100);
        const output2 = result2.buf;
        expect(result2.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        expect(textDecoder.decode(new Uint8Array([...output1, ...output2]))).to.equal('Brotli brotli brotli brotli');
    });

    it("does not fail when streamingly compressing with an illegal quality value", () => {
        const input = textEncoder.encode("Test input data");
        const input1 = input.slice(0, input.length / 2);
        const input2 = input.slice(input.length / 2);
        const quality = 12;
        const stream = new brotli.CompressStream(quality);
        const result1 = stream.compress(input1, 100);
        const output1 = result1.buf;
        expect(result1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const result2 = stream.compress(input2, 100);
        const output2 = result2.buf;
        expect(result2.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const result3 = stream.compress(undefined, 100);
        const output3 = result3.buf;
        expect(result3.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        expect(dataToBase64([...output1, ...output2, ...output3])).to.equal('Gw4A+KWpyubolCCjVAjmxJ4D');
    });

    it("cleanly fails when streamingly decompressing garbage", () => {
        const input = textEncoder.encode("This is not brotli data, it's just a string");
        const stream = new brotli.DecompressStream();
        expect(() =>
            stream.decompress(input, 100)
        ).to.throw('Brotli streaming decompress failed');
    });

    it("can streamingly compress & decompress back to the original result", () => {
        const s = "Some thrilling text I urgently need to compress";
        const encInput = textEncoder.encode(s);
        const encInput1 = encInput.slice(0, encInput.length / 2);
        const encInput2 = encInput.slice(encInput.length / 2);
        const encStream = new brotli.CompressStream();
        const encResult1 = encStream.compress(encInput1, 100);
        const encOutput1 = encResult1.buf;
        expect(encResult1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const encResult2 = encStream.compress(encInput2, 100);
        const encOutput2 = encResult2.buf;
        expect(encResult2.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const encResult3 = encStream.compress(undefined, 100);
        const encOutput3 = encResult3.buf;
        expect(encResult3.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        const encOutput = new Uint8Array([...encOutput1, ...encOutput2, ...encOutput3]);

        const decInput1 = encOutput.slice(0, encOutput.length / 2);
        const decInput2 = encOutput.slice(encOutput.length / 2);
        const decStream = new brotli.DecompressStream();
        const decResult1 = decStream.decompress(decInput1, 100);
        const decOutput1 = decResult1.buf;
        expect(decResult1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const decResult2 = decStream.decompress(decInput2, 100);
        const decOutput2 = decResult2.buf;
        expect(decResult2.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        const decOutput = new Uint8Array([...decOutput1, ...decOutput2]);

        expect(textDecoder.decode(decOutput)).to.equal(s);
    });

    it("can streamingly compress & decompress back to the original result with a different quality setting", () => {
        const s = "Some thrilling text I urgently need to compress";
        const encInput = textEncoder.encode(s);
        const encInput1 = encInput.slice(0, encInput.length / 2);
        const encInput2 = encInput.slice(encInput.length / 2);
        const quality = 3;
        const encStream = new brotli.CompressStream(quality);
        const encResult1 = encStream.compress(encInput1, 100);
        const encOutput1 = encResult1.buf;
        expect(encResult1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const encResult2 = encStream.compress(encInput2, 100);
        const encOutput2 = encResult2.buf;
        expect(encResult2.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const encResult3 = encStream.compress(undefined, 100);
        const encOutput3 = encResult3.buf;
        expect(encResult3.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        const encOutput = new Uint8Array([...encOutput1, ...encOutput2, ...encOutput3]);

        const decInput1 = encOutput.slice(0, encOutput.length / 2);
        const decInput2 = encOutput.slice(encOutput.length / 2);
        const decStream = new brotli.DecompressStream();
        const decResult1 = decStream.decompress(decInput1, 100);
        const decOutput1 = decResult1.buf;
        expect(decResult1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const decResult2 = decStream.decompress(decInput2, 100);
        const decOutput2 = decResult2.buf;
        expect(decResult2.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        const decOutput = new Uint8Array([...decOutput1, ...decOutput2]);

        expect(textDecoder.decode(decOutput)).to.equal(s);
    });

    it("streaming compressing can handle needing more output when action is process", function () {
        this.timeout(10000);
        // The input should be more than about 1.6MB with enough randomness
        // to make the compressor ask for more output space when the action is PROCESS
        const input = generateRandomBytes(1600000);
        const stream = new brotli.CompressStream();
        const result1 = stream.compress(input, 1);
        const output1 = result1.buf;
        expect(result1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreOutput);
        const result2 = stream.compress(input.slice(result1.input_offset), 1500000);
        const output2 = result2.buf;
        expect(result2.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const result3 = stream.compress(undefined, 1640000);
        const output3 = result3.buf;
        expect(result3.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        const output = new Uint8Array([...output1, ...output2, ...output3]);

        expect([...brotli.decompress(output)]).to.deep.equal([...input]);
    });

    it("streaming compressing can handle needing more output when action is finish", () => {
        const input = textEncoder.encode('Some thrilling text I urgently need to compress');
        const stream = new brotli.CompressStream();
        const result1 = stream.compress(input, 1);
        const output1 = result1.buf;
        expect(result1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreInput);
        const result2 = stream.compress(undefined, 1);
        const output2 = result2.buf;
        expect(result2.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreOutput);
        const result3 = stream.compress(undefined, 100);
        const output3 = result3.buf;
        expect(result3.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        const output = new Uint8Array([...output1, ...output2, ...output3]);
        expect(dataToBase64(brotli.decompress(output))).to.equal(dataToBase64(input));
    });

    it("streaming decompressing can handle needing more output", () => {
        const input = base64ToData('GxoAABypU587dC0k9ianQOgqjS32iUTcCA==');
        const stream = new brotli.DecompressStream();
        const result1 = stream.decompress(input, 1);
        const output1 = result1.buf;
        expect(result1.code).to.equal(brotli.BrotliStreamResultCode.NeedsMoreOutput);
        const result2 = stream.decompress(input.slice(result1.input_offset), 100);
        const output2 = result2.buf;
        expect(result2.code).to.equal(brotli.BrotliStreamResultCode.ResultSuccess);
        expect(textDecoder.decode(new Uint8Array([...output1, ...output2]))).to.equal('Brotli brotli brotli brotli');
    });

    const areStreamsAvailable = !!globalThis.TransformStream;

    it("can streamingly compress & decompress back to the original result with web streams", async function () {
        if (!areStreamsAvailable) return this.skip();

        // This is very similar to the streaming example in the README, but with reduced buffer sizes to
        // try and ensure it catches any issues:

        let input = "";
        for (let i = 0; i < 1000; i++) {
            input += `${i}: Brotli brotli brotli brotli `;
        }

        const inputStream = new ReadableStream({
            start(controller) {
                controller.enqueue(input);
                controller.close();
            }
        });

        const textEncoderStream = new TextEncoderStream();

        const compressStream = new brotli.CompressStream();
        const compressionStream = new TransformStream({
            transform(chunk, controller) {
                let resultCode;
                let inputOffset = 0;
                do {
                    const input = chunk.slice(inputOffset);
                    const result = compressStream.compress(input, 10);
                    controller.enqueue(result.buf);
                    resultCode = result.code;
                    inputOffset += result.input_offset;
                } while (resultCode === brotli.BrotliStreamResultCode.NeedsMoreOutput);
                if (resultCode !== brotli.BrotliStreamResultCode.NeedsMoreInput) {
                    controller.error(`Brotli compression failed when transforming with code ${resultCode}`);
                }
            },
            flush(controller) {
                let resultCode;
                do {
                    const result = compressStream.compress(undefined, 10);
                    controller.enqueue(result.buf);
                    resultCode = result.code;
                } while (resultCode === brotli.BrotliStreamResultCode.NeedsMoreOutput)
                if (resultCode !== brotli.BrotliStreamResultCode.ResultSuccess) {
                    controller.error(`Brotli compression failed when flushing with code ${resultCode}`);
                }
                controller.terminate();
            }
        });

        const decompressStream = new brotli.DecompressStream();
        const decompressionStream = new TransformStream({
            transform(chunk, controller) {
                let resultCode;
                let inputOffset = 0;
                do {
                    const input = chunk.slice(inputOffset);
                    const result = decompressStream.decompress(input, 100);
                    controller.enqueue(result.buf);
                    resultCode = result.code;
                    inputOffset += result.input_offset;
                } while (resultCode === brotli.BrotliStreamResultCode.NeedsMoreOutput);
                if (
                    resultCode !== brotli.BrotliStreamResultCode.NeedsMoreInput &&
                    resultCode !== brotli.BrotliStreamResultCode.ResultSuccess
                ) {
                  controller.error(`Brotli decompression failed with code ${resultCode}`)
                }
            },
            flush(controller) {
                controller.terminate();
            }
        });

        const textDecoderStream = new TextDecoderStream();

        let output = '';
        const outputStream = new WritableStream({
            write(chunk) {
                output += chunk;
            }
        });

        await inputStream
            .pipeThrough(textEncoderStream)
            .pipeThrough(compressionStream)
            .pipeThrough(decompressionStream)
            .pipeThrough(textDecoderStream)
            .pipeTo(outputStream);

        expect(output).to.equal(input);
  });
});

function generateRandomBytes(size: number) {
    const resultArray = new Uint8Array(size);
    let generatedSize = 0;

    // We can only generate 65535 bytes at a time, so we loop up to size:
    while (generatedSize < size) {
        const sizeToGenerate = Math.min(size - generatedSize, 65535);
        const stepResultArray = new Uint8Array(sizeToGenerate);

        getRandomValues(stepResultArray);

        resultArray.set(stepResultArray, generatedSize);
        generatedSize += sizeToGenerate;
    }

    return resultArray;
}
