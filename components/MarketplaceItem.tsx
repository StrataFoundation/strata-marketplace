import { Alert, Button, Heading, Image, Input, Text, VStack } from "@chakra-ui/react";
import { PublicKey } from "@solana/web3.js";
import { Notification, useBondingPricing, useMint, useProvider, useStrataSdks, useTokenBonding, useTokenMetadata } from "@strata-foundation/react";
import { SplTokenBonding } from "@strata-foundation/spl-token-bonding";
import BN from "bn.js";
import React, { useState } from "react";
import { useAsyncCallback } from "react-async-hook";
import toast from "react-hot-toast";


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

export const MarketplaceItem = ({ tokenBondingKey, name, description, image }: { tokenBondingKey: PublicKey | undefined, name: string, description: string, image: string }) => {
  const { info: tokenBonding } = useTokenBonding(tokenBondingKey);
  const targetMint = useMint(tokenBonding?.targetMint);
  const { image: targetImage, metadata: targetMetadata, data: targetData, loading: targetMetaLoading } = useTokenMetadata(tokenBonding?.targetMint);
  const { metadata: baseMetadata } = useTokenMetadata(tokenBonding?.baseMint);
  const { pricing } = useBondingPricing(tokenBondingKey);
  const { tokenBondingSdk } = useStrataSdks();
  const [qty, setQty] = useState("0");
  const { execute, loading, error } = useAsyncCallback(buy);
  const { awaitingApproval } = useProvider();
  const qtyNumber = Number(qty);
  const mintCapNumber = (tokenBonding?.mintCap as BN | undefined)?.toNumber();
  const targetSupplyNumber = targetMint?.supply.toNumber()
  const passedMintCap = (targetSupplyNumber || 0) >= (mintCapNumber || 0);
  name = targetMetadata?.data.name || name;
  image = targetImage || image;
  description = targetData?.description || description;


  return <VStack
    p={4}
    align="start"
  >
    <Image w="full" src={image} />
    <Heading>{name}</Heading>
    <Text whiteSpace="pre-line">{description}</Text>
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
      {passedMintCap ? "Sold Out" : "Buy"}
    </Button>
  </VStack>
}