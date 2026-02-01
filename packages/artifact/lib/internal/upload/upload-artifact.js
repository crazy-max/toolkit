"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadArtifact = uploadArtifact;
const core = __importStar(require("@actions/core"));
const path = __importStar(require("path"));
const retention_1 = require("./retention");
const path_and_artifact_name_validation_1 = require("./path-and-artifact-name-validation");
const artifact_twirp_client_1 = require("../shared/artifact-twirp-client");
const upload_zip_specification_1 = require("./upload-zip-specification");
const util_1 = require("../shared/util");
const blob_upload_1 = require("./blob-upload");
const zip_1 = require("./zip");
const stream_1 = require("./stream");
const generated_1 = require("../../generated");
const errors_1 = require("../shared/errors");
const types_1 = require("./types");
function uploadArtifact(name, files, rootDirectory, options) {
    return __awaiter(this, void 0, void 0, function* () {
        let artifactFileName = `${name}.zip`;
        if (options === null || options === void 0 ? void 0 : options.skipArchive) {
            if (files.length > 1) {
                throw new Error('skipArchive option is only supported when uploading a single file');
            }
            artifactFileName = path.basename(files[0]);
            name = artifactFileName;
        }
        (0, path_and_artifact_name_validation_1.validateArtifactName)(name);
        (0, upload_zip_specification_1.validateRootDirectory)(rootDirectory);
        const zipSpecification = (0, upload_zip_specification_1.getUploadZipSpecification)(files, rootDirectory);
        if (!(options === null || options === void 0 ? void 0 : options.skipArchive) && zipSpecification.length === 0) {
            throw new errors_1.FilesNotFoundError(zipSpecification.flatMap(s => (s.sourcePath ? [s.sourcePath] : [])));
        }
        const contentType = (0, types_1.getMimeType)(artifactFileName);
        // get the IDs needed for the artifact creation
        const backendIds = (0, util_1.getBackendIdsFromToken)();
        // create the artifact client
        const artifactClient = (0, artifact_twirp_client_1.internalArtifactTwirpClient)();
        // create the artifact
        const createArtifactReq = {
            workflowRunBackendId: backendIds.workflowRunBackendId,
            workflowJobRunBackendId: backendIds.workflowJobRunBackendId,
            name,
            mimeType: generated_1.StringValue.create({ value: contentType }),
            version: 7
        };
        // if there is a retention period, add it to the request
        const expiresAt = (0, retention_1.getExpiration)(options === null || options === void 0 ? void 0 : options.retentionDays);
        if (expiresAt) {
            createArtifactReq.expiresAt = expiresAt;
        }
        const createArtifactResp = yield artifactClient.CreateArtifact(createArtifactReq);
        if (!createArtifactResp.ok) {
            throw new errors_1.InvalidResponseError('CreateArtifact: response from backend was not ok');
        }
        let stream;
        if (options === null || options === void 0 ? void 0 : options.skipArchive) {
            // Upload raw file without archiving
            stream = yield (0, stream_1.createRawFileUploadStream)(files[0]);
        }
        else {
            // Create and upload zip archive
            stream = yield (0, zip_1.createZipUploadStream)(zipSpecification, options === null || options === void 0 ? void 0 : options.compressionLevel);
        }
        core.info(`Uploading artifact: ${artifactFileName}`);
        const uploadResult = yield (0, blob_upload_1.uploadToBlobStorage)(createArtifactResp.signedUploadUrl, stream, contentType);
        // finalize the artifact
        const finalizeArtifactReq = {
            workflowRunBackendId: backendIds.workflowRunBackendId,
            workflowJobRunBackendId: backendIds.workflowJobRunBackendId,
            name,
            size: uploadResult.uploadSize ? uploadResult.uploadSize.toString() : '0'
        };
        if (uploadResult.sha256Hash) {
            finalizeArtifactReq.hash = generated_1.StringValue.create({
                value: `sha256:${uploadResult.sha256Hash}`
            });
        }
        core.info(`Finalizing artifact upload`);
        const finalizeArtifactResp = yield artifactClient.FinalizeArtifact(finalizeArtifactReq);
        if (!finalizeArtifactResp.ok) {
            throw new errors_1.InvalidResponseError('FinalizeArtifact: response from backend was not ok');
        }
        const artifactId = BigInt(finalizeArtifactResp.artifactId);
        core.info(`Artifact ${name} successfully finalized. Artifact ID ${artifactId}`);
        return {
            size: uploadResult.uploadSize,
            digest: uploadResult.sha256Hash,
            id: Number(artifactId)
        };
    });
}
//# sourceMappingURL=upload-artifact.js.map