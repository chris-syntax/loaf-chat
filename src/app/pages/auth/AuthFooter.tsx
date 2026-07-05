import React from 'react';
import { Box, Text } from 'folds';
import * as css from './styles.css';

export function AuthFooter() {
  return (
    <Box className={css.AuthFooter} justifyContent="Center" gap="400" wrap="Wrap">
      <Text as="a" size="T300" href="https://loaf.moe" target="_blank" rel="noreferrer">
        About
      </Text>
      <Text
        as="a"
        size="T300"
        href="https://github.com/chris-syntax/loaf-chat"
        target="_blank"
        rel="noreferrer"
      >
        Source
      </Text>
      <Text size="T300">v4.12.3.1</Text>
    </Box>
  );
}
