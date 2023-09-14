// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { Credentials } from '@aws-sdk/types';
import { Amplify } from '@aws-amplify/core';
import { getObject } from '../../../../src/providers/s3/utils/client';
import { downloadData } from '../../../../src/providers/s3';
import { createDownloadTask } from '../../../../src/providers/s3/utils';
import { StorageOptions } from '../../../../src/types';

jest.mock('../../../../src/providers/s3/utils/client');
jest.mock('../../../../src/providers/s3/utils');
jest.mock('@aws-amplify/core', () => ({
	Amplify: {
		getConfig: jest.fn(),
		Auth: {
			fetchAuthSession: jest.fn(),
		},
	},
}));
const credentials: Credentials = {
	accessKeyId: 'accessKeyId',
	sessionToken: 'sessionToken',
	secretAccessKey: 'secretAccessKey',
};
const key = 'key';
const bucket = 'bucket';
const region = 'region';
const targetIdentityId = 'targetIdentityId';
const defaultIdentityId = 'defaultIdentityId';

const mockFetchAuthSession = Amplify.Auth.fetchAuthSession as jest.Mock;
const mockCreateDownloadTask = createDownloadTask as jest.Mock;
const mockGetConfig = Amplify.getConfig as jest.Mock;

// TODO: test validation errors
// TODO: test downloadData from guest, private, protected access level respectively.
describe('downloadData', () => {
	beforeAll(() => {
		mockFetchAuthSession.mockResolvedValue({
			credentials,
			identityId: defaultIdentityId,
		});
		mockGetConfig.mockReturnValue({
			Storage: {
				S3: {
					bucket,
					region,
				},
			},
		});
	});
	mockCreateDownloadTask.mockReturnValue('downloadTask');

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('should return a download task', async () => {
		expect(downloadData({ key: 'key' })).toBe('downloadTask');
	});

	[
		{
			expectedKey: `public/${key}`,
		},
		{
			options: { accessLevel: 'guest' },
			expectedKey: `public/${key}`,
		},
		{
			options: { accessLevel: 'private' },
			expectedKey: `private/${defaultIdentityId}/${key}`,
		},
		{
			options: { accessLevel: 'protected' },
			expectedKey: `protected/${defaultIdentityId}/${key}`,
		},
		{
			options: { accessLevel: 'protected', targetIdentityId },
			expectedKey: `protected/${targetIdentityId}/${key}`,
		},
	].forEach(({ options, expectedKey }) => {
		const accessLevelMsg = options?.accessLevel ?? 'default';
		const targetIdentityIdMsg = options?.targetIdentityId
			? `and targetIdentityId`
			: '';

		it(`should supply the correct parameters to getObject API handler with ${accessLevelMsg} accessLevel ${targetIdentityIdMsg}`, async () => {
			expect.assertions(2);
			(getObject as jest.Mock).mockResolvedValueOnce({ Body: 'body' });
			const onProgress = jest.fn();
			downloadData({
				key,
				options: {
					...(options as StorageOptions),
					useAccelerateEndpoint: true,
					onProgress,
				},
			});
			const job = mockCreateDownloadTask.mock.calls[0][0].job;
			await job();
			expect(getObject).toBeCalledTimes(1);
			expect(getObject).toHaveBeenCalledWith(
				{
					credentials,
					region,
					useAccelerateEndpoint: true,
					onDownloadProgress: onProgress,
					abortSignal: expect.any(AbortSignal),
				},
				{
					Bucket: bucket,
					Key: expectedKey,
				}
			);
		});
	});

	it('should assign the getObject API handler response to the result', async () => {
		expect.assertions(2);
		const lastModified = 'lastModified';
		const contentLength = 'contentLength';
		const eTag = 'eTag';
		const metadata = 'metadata';
		const versionId = 'versionId';
		const contentType = 'contentType';
		const body = 'body';
		const key = 'key';
		(getObject as jest.Mock).mockResolvedValueOnce({
			Body: body,
			LastModified: lastModified,
			ContentLength: contentLength,
			ETag: eTag,
			Metadata: metadata,
			VersionId: versionId,
			ContentType: contentType,
		});
		downloadData({ key });
		const job = mockCreateDownloadTask.mock.calls[0][0].job;
		const result = await job();
		expect(getObject).toBeCalledTimes(1);
		expect(result).toEqual({
			key,
			body,
			lastModified,
			size: contentLength,
			eTag,
			metadata,
			versionId,
			contentType,
		});
	});
});
