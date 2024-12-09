import * as reporter from '../reporter';
import { getStickyDisk } from '../setup_builder';
import FormData from 'form-data';

jest.mock('../reporter');

describe('getStickyDisk', () => {
  const mockGet = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.GITHUB_REPO_NAME = 'test-repo';
    process.env.BLACKSMITH_REGION = 'test-region';
    process.env.BLACKSMITH_INSTALLATION_MODEL_ID = 'test-model';
    process.env.VM_ID = 'test-vm';

    (reporter.createBlacksmithAgentClient as jest.Mock).mockResolvedValue({});
    (reporter.get as jest.Mock).mockImplementation(mockGet);
    mockGet.mockResolvedValue({
      data: {
        expose_id: 'test-expose-id',
        disk_identifier: 'test-device'
      }
    });
  });

  it('sets both FormData and query parameters correctly', async () => {
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    
    await getStickyDisk();

    expect(mockGet).toHaveBeenCalledTimes(1);
    const [, url, formData] = mockGet.mock.calls[0];

    // Verify query parameters
    expect(url).toContain('stickyDiskKey=test-repo');
    expect(url).toContain('region=test-region');
    expect(url).toContain('installationModelID=test-model');
    expect(url).toContain('vmID=test-vm');

    // Verify FormData is correct type
    expect(formData instanceof FormData).toBeTruthy();
    
    // Verify the headers are set correctly
    const headers = formData.getHeaders();
    expect(headers['content-type']).toContain('multipart/form-data');

    // Verify the correct fields were appended
    expect(appendSpy).toHaveBeenCalledWith('stickyDiskKey', 'test-repo');
    expect(appendSpy).toHaveBeenCalledWith('region', 'test-region');
    expect(appendSpy).toHaveBeenCalledWith('installationModelID', 'test-model');
    expect(appendSpy).toHaveBeenCalledWith('vmID', 'test-vm');
  });
}); 