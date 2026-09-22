import { uploadFile } from 'zitejs/upload';
import type { FileValue } from '@project/shared/forms/types';

/** Upload a file the applicant picked and describe it the way answers store files. */
export async function uploadAnswerFile(file: File): Promise<FileValue> {
  const { fileUrl } = await uploadFile({ data: file, filename: file.name });
  if (!fileUrl) throw new Error('The upload service did not return a link');
  return { url: fileUrl, name: file.name, size: file.size, type: file.type || '' };
}
