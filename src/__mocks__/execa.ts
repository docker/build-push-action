export const execa = jest.fn().mockImplementation(() => {
  return {
    stdout: '',
    stderr: '',
    exitCode: 0
  };
}); 
