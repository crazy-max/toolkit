import { UploadZipSpecification } from './upload-zip-specification';
import { WaterMarkedUploadStream } from './stream';
export declare const DEFAULT_COMPRESSION_LEVEL = 6;
export declare function createZipUploadStream(uploadSpecification: UploadZipSpecification[], compressionLevel?: number): Promise<WaterMarkedUploadStream>;
