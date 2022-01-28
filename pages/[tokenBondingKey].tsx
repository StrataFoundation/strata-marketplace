import React, { useState } from "react";
import { useRouter } from 'next/router'
import { Spinner, useBondingPricing, usePublicKey, useStrataSdks, useTokenBonding, useTokenMetadata, Notification, useProvider, useMint } from "@strata-foundation/react";
import { FormLabel, Input, Text, Box, Image, Heading, Container, VStack, FormHelperText, Button, Alert } from "@chakra-ui/react";
import { SplTokenBonding } from "@strata-foundation/spl-token-bonding";
import { useAsyncCallback } from "react-async-hook";
import { PublicKey } from "@solana/web3.js";
import toast from "react-hot-toast";
import { NextPage } from "next";
import BN from "bn.js";

async function buy(tokenBondingSdk: SplTokenBonding, tokenBonding: PublicKey, quantity: number): Promise<void> {
  await tokenBondingSdk.buy({
    tokenBonding,
    desiredTargetAmount: quantity,
    slippage: 0.05
  })

  toast.custom((t) => (
    <Notification
      show={t.visible}
      type="success"
      heading="Transactoin Successful"
      message={`Successfully purchased ${quantity}`}
      onDismiss={() => toast.dismiss(t.id)}
    />
  ))
}

export const MarketDisplay: NextPage = () => {
  const router = useRouter()
  const { tokenBondingKey: tokenBondingKeyRaw } = router.query;
  const tokenBondingKey = usePublicKey(tokenBondingKeyRaw as string);
  const { info: tokenBonding, loading: loadingTokenBonding } = useTokenBonding(tokenBondingKey);
  const targetMint = useMint(tokenBonding?.targetMint);
  const { image: targetImage, metadata: targetMetadata, data: targetData, loading: targetMetaLoading } = useTokenMetadata(tokenBonding?.targetMint);
  const { image: baseImage, metadata: baseMetadata, loading: baseMetaLoading } = useTokenMetadata(tokenBonding?.baseMint);
  const { pricing, loading: loadingPricing } = useBondingPricing(tokenBondingKey);
  const { tokenBondingSdk } = useStrataSdks();
  const [qty, setQty] = useState("0");
  const { execute, loading, error } = useAsyncCallback(buy);
  const { awaitingApproval } = useProvider();
  const qtyNumber = Number(qty);
  const mintCapNumber = (tokenBonding?.mintCap as BN | undefined)?.toNumber();
  const targetSupplyNumber = targetMint?.supply.toNumber()
  const passedMintCap = (targetSupplyNumber || 0) >= (mintCapNumber || 0);

  if (targetMetaLoading || baseMetaLoading || loadingPricing || loadingTokenBonding) {
    return <Spinner />
  }

  return <Container>
    <VStack
      rounded="lg"
      p={4}
      borderColor="#ccc"
      border="1px solid"
      align="start"
    >
      <Image w="full" src={targetImage} />
      <Heading>{targetMetadata?.data.name}</Heading>
      <Text>{targetData?.description}</Text>
      <div id="price">
        <Input
          placeholder="Quantity"
          onChange={(event) => setQty(event.target.value)}
          type="number" 
          min={1} 
        />
        <Text size="sm">
          <b>Price:</b> {pricing?.buyTargetAmount(Number(qty) || 1)} {baseMetadata?.data.symbol}
        </Text>
        <Text size="sm">
          <b>Available:</b> {(mintCapNumber || 0) - (targetSupplyNumber || 0)} / {mintCapNumber || 0}
        </Text>
      </div>
      {error && <Alert status="error">
        <Alert status="error">
          {error.toString()}
        </Alert>
      </Alert>}
      <Button
        isDisabled={passedMintCap || !qtyNumber || qtyNumber <= 0}
        isLoading={loading}
        value={qty}
        loadingText={awaitingApproval ? "Awaiting Approval" : "Loading"}
        onClick={() => qtyNumber && qtyNumber > 0 && execute(tokenBondingSdk!, tokenBondingKey!, qtyNumber)}
        w="full"
        size="lg"
        colorScheme="blue"
      >
        { passedMintCap ? "Sold Out" : "Buy" }
      </Button>
    </VStack>
  </Container>
}

export default MarketDisplay;